# matsim network converter
try:
    import sys, json, zipfile
    import matsim
    from dfply import *
    from pyproj import Transformer
except:
    print("OOPS! Error importing required libraries.")
    print('try "pip3 install matsim-tools dfply pyproj"')

if len(sys.argv) != 3:
    print(
        "USAGE:  python create-gmns-network.py  [network]  [coord-system]"
    )
    sys.exit(1)


p_network = sys.argv[1]
p_coords = sys.argv[2]
out_file = p_network + ".gmns.zip"

coord_transformer = Transformer.from_crs(p_coords, "EPSG:4326")

print("reading network:", p_network)
network = matsim.read_network(p_network)

# ----- config
# TODO: get real config from file instead of hardcoded everything
config = """dataset_name,short_length,long_length,speed,crs,geometry_field_format,currency,version_number
network,m,km,kph,25833,wkt,Euro cents,0.94"""

with open("config.csv", "w") as f:
    f.write(config)

# ----- nodes
network.nodes = network.nodes.rename(columns={
    "x": "x_coord",
    "y": "y_coord",
})
network.nodes.to_csv("node.csv", index=False)

# ----- links
network.links = network.links.rename(columns={
    "from_node": "from_node_id",
    "to_node": "to_node_id",
})
network.links.to_csv("link.csv", index=False)


# # convert coords to lat/lon
# print("reprojecting coordinates")
# converted_links = {}
# for link in links.values:
#     coords = []

#     fromY, fromX = coord_transformer.transform(link[1],link[2])
#     coords.extend([round(fromX, 6), round(fromY, 6)])
#     toY, toX = coord_transformer.transform(link[3], link[4])
#     coords.extend([round(toX, 6), round(toY, 6)])

#     converted_links[link[0]] = coords

# write it out
print("create zip:", out_file)

with zipfile.ZipFile(out_file, "w", compression=zipfile.ZIP_DEFLATED) as f:
    f.write("config.csv")
    f.write("node.csv")
    f.write("link.csv")
