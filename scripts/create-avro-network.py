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

print("\nNETWORK ATTRIBUTES\n", network.network_attrs)

record = {
    '__attributes': network.network_attrs,
    '__numNodes': numNodes,
    # '__nodeId': nodeId,
    # '__nodeX': nodeX,
    # '__nodeY': nodeY,
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


print('create link-id offset lookup')
link_lookup = {}
for i in range(len(record['id'])):
    link_lookup[record['id'][i]] = i

print('think about link attributes')
all_attribute_defs = {}
attributes = {}
for attr in network.link_attrs.values:
    all_attribute_defs[attr[1]] = attr[3] # type is in attr[3]
    # if attr[1] not in keep: continue
    linkID = attr[0]
    if linkID not in attributes: attributes[linkID] = {}
    attributes[linkID][attr[1]] = attr[2]

print('build link attribute columns')
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
print (network_schema)

schema = avro.schema.parse(network_schema)

writer = DataFileWriter(open("network.avro", "wb"), DatumWriter(), schema, codec='deflate')
# DataFileWriter.setCodec(CodecFactory.deflateCodec(6));
writer.append(record)
writer.close()

sys.exit(0)



# Build link x/y lookup
nodes = network.nodes >> mutate(to_node=X.node_id, from_node=X.node_id)


links = (
    network.links
    >> inner_join(nodes, by="from_node")
    >> mutate(x0=X.x, y0=X.y, to_node=X.to_node_x)
    >> inner_join(nodes, by="to_node")
    >> rename(from_node=X.node_id_x, to_node=X.node_id_y)
    >> drop(['x_x', 'y_x', 'z_x','z_y','to_node'])
)
    # >> select(X.link_id, X.from_node, X.to_node_x, X.x, X.y)
    # >> select(X.link_id, X.x0, X.y0, X.x_y, X.y_y)

# insert column with insert(location, column_name, column_value)
column_to_move = links.pop("link_id")
links.insert(0, "link_id", column_to_move)

column_to_move = links.pop("x0")
links.insert(1, "x0", column_to_move)
column_to_move = links.pop("y0")
links.insert(2, "y0", column_to_move)
column_to_move = links.pop("x_y")
links.insert(3, "x_y", column_to_move)
column_to_move = links.pop("y_y")
links.insert(4, "y_y", column_to_move)

link_basics = {}

# convert coords to lat/lon
print("reprojecting coordinates")

converted_links = {}
for link in links.values:
    coords = []

    fromY, fromX = coord_transformer.transform(link[1],link[2])
    coords.extend([round(fromX, 6), round(fromY, 6)])
    toY, toX = coord_transformer.transform(link[3], link[4])
    coords.extend([round(toX, 6), round(toY, 6)])

    converted_links[link[0]] = coords

links = (
    links >> drop(['x0','y0','x_y','y_y','from_node_x', 'from_node_y', 'to_node_x', 'to_node_y'])
)

columnsList = links.columns.tolist()[1:]

# one more lookup
for zlink in links.values:
    props = {}
    b = 0
    for col in columnsList:
        b += 1
        if col not in keep: continue
        props[col] = zlink[b]
    link_basics[zlink[0]] = props

# convert to geojson
print("creating geojson")
geojson = {
    "type": "FeatureCollection",
    "features": []
}

# think about link attributes
attributes = {}
for attr in network.link_attrs.values:
    if attr[1] not in keep: continue
    linkID = attr[0]
    if linkID not in attributes: attributes[linkID] = {}
    attributes[linkID][attr[1]] = attr[2]

# for link in link.values:

for link_id in converted_links:
    points = converted_links[link_id]
    merged_props = link_basics[link_id]
    attrMega = attributes.get(link_id) or {}
    merged_props.update(attrMega)

    geojson["features"].append({
        "type": "Feature",
        "id": link_id,
        "properties": merged_props,
        "geometry": {
            "type": "LineString",
            "coordinates": [ [points[0],points[1]], [points[2],points[3]]]
        }
    })


# write it out
print("writing:", out_file)
#links_bytes = json.dumps(geojson, separators=(',',":")).encode("utf-8")
links_bytes = json.dumps(geojson).encode("utf-8")

with gzip.open(out_file, "wb") as f:
    f.write(links_bytes)

print(len(converted_links), "links written.")
