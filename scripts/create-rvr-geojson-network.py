# matsim network converter
try:
    import sys, json, gzip
    import matsim
    from dfply import *
    from pyproj import Transformer
except:
    print("OOPS! Error importing required libraries.")
    print('try "pip3 install matsim-tools dfply pyproj"')

if len(sys.argv) != 3:
    print(
        "USAGE:  python create-geojson-network.py  [network]  [coord-system]"
    )
    sys.exit(1)


# keep = {'length', 'freespeed','capacity','permlanes','modes',
#         "zoneGroup", 'allowed_speed','bicycleInfrastructureSpeedFactor',
#         "origid", "surface", "type", "zoneName"
#         }
keep = {'length', "type" }
print('Keeping columns:', keep)

p_network = sys.argv[1]
p_coords = sys.argv[2]
out_file = p_network + ".geojson.gz"

coord_transformer = Transformer.from_crs(p_coords, "EPSG:4326")

print("reading network:", p_network)
network = matsim.read_network(p_network)

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
