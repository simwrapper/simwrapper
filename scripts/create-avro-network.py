# matsim network converter
try:
    import sys, json, gzip
    import matsim

    from dfply import *
    from pyproj import Transformer
    import avro.schema

    from avro.datafile import DataFileReader, DataFileWriter
    from avro.io import DatumReader, DatumWriter

except:
    print("OOPS! Error importing required libraries.")
    print('try "pip3 install matsim-tools dfply pyproj"')

if len(sys.argv) != 3:
    print(
        "USAGE:  python create-geojson-network.py  [network]  [coord-system]"
    )
    sys.exit(1)

network_schema = '''
{
    "namespace": "matsim.avro",
    "type": "record",
    "name": "network",
    "fields": [
        {"name": "__attributes",  "type": {"type":"map", "values": "string"}},
        {"name": "__numNodes", "type": "int"},
        {"name": "__nodes",  "type": {"type": "map", "values": { "type": "array", "items":"float" }}},

%LINKS%

        {"name": "__numLinks", "type": "int"}
    ]
}
'''
        # {"name": "__nodeId", "type": {"type": "array", "items":"string" }},
        # {"name": "__nodeX",  "type": {"type": "array", "items":"float" }},
        # {"name": "__nodeY",  "type": {"type": "array", "items":"float" }},
        # {"name": "__nodeAttr", "type": {"type":"map", "values":["string","float","int"] }},
        # {"name": "__linkColumns", "type": {"type": "array", "items":"string" }}


# keep = {'length', 'freespeed','capacity','permlanes','modes',
#         "zoneGroup", 'allowed_speed','bicycleInfrastructureSpeedFactor',
#         "origid", "surface", "type", "zoneName"
#         }

p_network = sys.argv[1]
p_coords = sys.argv[2]
out_file = p_network + ".geojson.gz"

coord_transformer = Transformer.from_crs(p_coords, "EPSG:4326")

print("reading network:", p_network)
network = matsim.read_network(p_network)

nodeId = network.nodes.node_id.tolist()
nodeX = network.nodes.x.tolist()
nodeY = network.nodes.y.tolist()
numNodes = len(nodeId)
numLinks = 0

# convert coordinates
nodes = {}

print('convert coordinates')
for i in range(len(nodeX)):
    Y, X = coord_transformer.transform(nodeX[i],nodeY[i])
    nodeX[i] = X
    nodeY[i] = Y
    nodes[str(nodeId[i])] = [X,Y]


# Rewrite CRS, because we are pre-converting to long/lat here.
network.network_attrs['coordinateReferenceSystem'] = 'EPSG:4326'
print("\nNETWORK ATTRIBUTES\n", network.network_attrs)

record = {
    '__attributes': network.network_attrs,
    '__numNodes': numNodes,
    '__nodes': nodes,
}

link_schema = []

standardTypes = {
    'capacity': 'float',
    'freespeed': 'float',
    'from_node': 'string',
    'to_node': 'string',
    'length': 'float',
    'link_id': 'string',
    'modes': 'string',
    'oneway': 'int',
    'permlanes': 'float'
}

for col in network.links.columns:
    print(col, network.links[col].dtype)

    if col in standardTypes:
        colType = standardTypes[col]
    else:
        colType = 'string'
        if network.links[col].dtype == 'float64': colType = 'float'
        if network.links[col].dtype == 'int': colType = 'int'

    # link_id should just be id
    colKey = col == 'link_id' and 'id' or col
    colKey = colKey == 'from_node' and 'from' or colKey
    colKey = colKey == 'to_node' and 'to' or colKey

    print('  ', col, colKey)
    link_schema.append(f'        {{"type":{{"type":"array", "items": "{colType}" }}, "name":"{colKey}"}},')
    record[colKey] = network.links[col].tolist()

    record['__numLinks'] = len(record[colKey])


print('\ncreate link-id offset lookup')
link_lookup = {}
for i in range(len(record['id'])):
    link_lookup[record['id'][i]] = i

print('\nthink about link attributes')
all_attribute_defs = {}
attributes = {}
for attr in network.link_attrs.values:
    all_attribute_defs[attr[1]] = attr[3] # type is in attr[3]
    # if attr[1] not in keep: continue
    linkID = attr[0]
    if linkID not in attributes: attributes[linkID] = {}
    attributes[linkID][attr[1]] = attr[2]

print('\nbuild link attribute columns')
nan = float('NaN')
all_attribute_defs.pop('origid')
print(1234, all_attribute_defs)

for col in all_attribute_defs:
    record[col] = []
for i in range(len(record['id'])):
    row_attributes = attributes.get(record['id'][i]) or {}
    for col in all_attribute_defs:
        v = row_attributes.get(col)
        if v == None:
            if all_attribute_defs[col] == 'java.lang.String':
                v = ''
            else:
                v = nan
        record[col].append(v)

for col in all_attribute_defs:
    colType = 'float'
    if isinstance(record[col][0], str): colType = 'string'
    link_schema.append(f'        {{"type":{{"type":"array", "items": "{colType}" }}, "name":"{col}"}},')


# insert all link columns into schema definition
linkDefs = '\n'.join(link_schema)
network_schema = network_schema.replace('%LINKS%', linkDefs)
print ('\nFINAL SCHEMA\n', network_schema)

print('\nWRITING final file:', 'network.avro')
schema = avro.schema.parse(network_schema)

writer = DataFileWriter(open("network.avro", "wb"), DatumWriter(), schema, codec='deflate')
writer.append(record)
writer.close()

sys.exit(0)
