# matsim network converter
try:
    import sys, json, gzip
    import matsim

    from pyproj import Transformer
    import avro.schema

    from avro.datafile import DataFileReader, DataFileWriter
    from avro.io import DatumReader, DatumWriter

except:
    print("OOPS! Error importing required libraries.")
    print('try "pip3 install avro matsim-tools pyproj"')

if len(sys.argv) != 3:
    print(
        "USAGE:  python create-geojson-network.py  [network]  [coord-system]"
    )
    sys.exit(1)

network_schema = '''
{
  "namespace": "org.matsim.application.avro",
  "type": "record",
  "name": "AvroNetwork",
  "fields": [
        {"name": "nodeAttributes", "type": {"type": "array", "items": "string"}},
        {"name": "linkAttributes", "type": {"type": "array", "items": "string"}},
        {"name": "nodeCoordinates", "type": {"type": "array", "items": "float"}},
        {"name": "nodeId", "type": {"type": "array", "items": "string"}},
        {"name": "allowedModes", "type": {"type": "array","items": "int"}},

%LINKDEFS%

        {"name": "crs", "type": "string", "doc": "Coordinate reference system"}

  ]
}'''


z = """
        {"name": "linkId", "type": {"type": "array", "items": "string" }},
        {"name": "from", "type": {"type": "array", "items": "int" }},
        {"name": "to", "type": {"type": "array", "items": "int"}},
        {"name": "allowedModes", "type": {"type": "array","items": "int"}},

        {"type": {  "type": "array",  "items": "float"},"name": "length"},
        {"type": {  "type": "array",  "items": "float"},"name": "freespeed" },
        {"type": {  "type": "array",  "items": "float"},"name": "capacity" },
        {"type": {  "type": "array",  "items": "float"},"name": "permlanes" }

"""

p_network = sys.argv[1]
p_coords = sys.argv[2]

coord_transformer = Transformer.from_crs(p_coords, "EPSG:4326")

print("reading network:", p_network)
network = matsim.read_network(p_network)

record = {
    "crs": "EPSG:4326",
}

print("get nodes")
nodeId = network.nodes.node_id.tolist()
nodeX = network.nodes.x.tolist()
nodeY = network.nodes.y.tolist()
numNodes = len(nodeId)
numLinks = 0

record["nodeId"] = nodeId
record["nodeAttributes"] = ['nodeId']

print('convert node coordinates')
nodeOffset = {}
nodeCoords = []

for i in range(numNodes):
    Y, X = coord_transformer.transform(nodeX[i],nodeY[i])
    nodeOffset[str(nodeId[i])] = i
    nodeCoords.extend([X,Y])

# Rewrite CRS, because we are pre-converting to long/lat here.
network.network_attrs['coordinateReferenceSystem'] = 'EPSG:4326'
print("\nNETWORK ATTRIBUTES\n", network.network_attrs)

link_schema = []
link_attribute_names = ["allowedModes"]

standardTypes = {
    'capacity': 'float',
    'freespeed': 'float',
    'from_node': 'int',
    'to_node': 'int',
    'length': 'float',
    'link_id': 'string',
    'modes': 'string',
    'oneway': 'string',
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
    colKey = col == 'link_id' and 'linkId' or col
    colKey = colKey == 'from_node' and 'from' or colKey
    colKey = colKey == 'to_node' and 'to' or colKey

    print('  ', col, colKey)

    if colKey != "origid":
        link_attribute_names.append(colKey)
        link_schema.append(f'        {{"type":{{"type":"array", "items": "{colType}" }}, "name":"{colKey}"}},')
        record[colKey] = network.links[col].tolist()

print('\ncreate link-id offset lookup')
link_lookup = {}
record["fromNodeOffset"] = []
record["toNodeOffset"] = []

numLinks = len(record['linkId'])

for i in range(numLinks):
    link_lookup[record['linkId'][i]] = i

    aNodeId = record['from'][i]
    bNodeId = record['to'][i]
    record["fromNodeOffset"].append(nodeOffset[aNodeId])
    record["toNodeOffset"].append(nodeOffset[bNodeId])

print('think about link attributes')
all_attribute_defs = {}
attributes = {}

try:
    for attr in network.link_attrs.values:
        all_attribute_defs[attr[1]] = attr[3] # type is in attr[3]
        # if attr[1] not in keep: continue
        linkID = attr[0]
        if linkID not in attributes: attributes[linkID] = {}
        attributes[linkID][attr[1]] = attr[2]
except:
    pass

print('build link attribute columns')
nan = float('NaN')
if "origid" in all_attribute_defs:
        all_attribute_defs.pop('origid')

for col in all_attribute_defs:
    record[col] = []

modeLookup = {}
allowedModes = []

for i in range(numLinks):
    row_attributes = attributes.get(record['linkId'][i]) or {}
    for col in all_attribute_defs:
        v = row_attributes.get(col)
        if v == None:
            if all_attribute_defs[col] == 'java.lang.String':
                v = ''
            else:
                v = nan
        record[col].append(v)

    #fix allowedModes
    mode = record["modes"][i]
    if mode not in modeLookup: modeLookup[mode] = len(modeLookup.keys())
    allowedModes.append(modeLookup[mode])

for col in all_attribute_defs:
    colType = 'float'
    if isinstance(record[col][0], str): colType = 'string'
    link_schema.append(f'        {{"type":{{"type":"array", "items": "{colType}" }}, "name":"{col}"}},')

print("build allowedModes")

# insert all link columns into schema definition
linkDefs = '\n'.join(link_schema)
network_schema = network_schema.replace('%LINKDEFS%', linkDefs)

# clean up!
record["nodeCoordinates"] = nodeCoords
record["from"] = record["fromNodeOffset"]
record["to"] = record["toNodeOffset"]
record["modes"] = list(modeLookup.keys())
record["allowedModes"] = allowedModes

del record["fromNodeOffset"]
del record["toNodeOffset"]

# list of link attributes
for attr in ["from","to","modes"]: link_attribute_names.remove(attr)
record["linkAttributes"] = link_attribute_names

print ('\nFINAL SCHEMA\n', network_schema)

print('\nWRITING final file:', 'network.avro')

print("RECORD")
print(record.keys())
print(numLinks, 'LINKS')

schema = avro.schema.parse(network_schema)
writer = DataFileWriter(open("network.avro", "wb"), DatumWriter(), schema, codec='deflate')
writer.append(record)
writer.close()

sys.exit(0)
