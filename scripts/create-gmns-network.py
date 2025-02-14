#!/usr/bin/env python3

# matsim network converter -> GMNS
# this does NOT convert coordinates: They are kept in their original coordinate system
# The GMNS npm library will convert this to proper 4326 (lng/lat) coordinates

try:
    import sys, zipfile, csv, os
    import matsim
except:
    print("OOPS! Error importing required libraries.")
    print('try "pip3 install matsim-tools"')

if len(sys.argv) != 3:
    print(
        "USAGE:  python create-gmns-network.py  [network]  [coord-system]"
    )
    sys.exit(1)

p_network = sys.argv[1]
p_coords = sys.argv[2]
out_file = p_network + ".gmns.zip"

print("reading network:", p_network)
network = matsim.read_network(p_network)

# ----- config
# TODO: get real config from file instead of hardcoded everything
config = """dataset_name,short_length,long_length,speed,crs,geometry_field_format,currency,version_number
network,m,km,kph,"""+p_coords+",wkt,Euro cents,0.94"

with open("config.csv", "w") as f:
    f.write(config)

# fix header line - pandas puts double quotes around column names, which Papaparse borks
trimcmd = sys.platform == 'darwin' and """sed -i '' '1s/"//g' """ or """sed -i '1s/"//g' """

# ----- nodes
network.nodes = network.nodes.rename(columns={
    "x": "x_coord",
    "y": "y_coord",
})
network.nodes.to_csv("node.csv", index=False, quoting=csv.QUOTE_NONNUMERIC)
os.system(trimcmd + "node.csv")

# ----- links
network.links = network.links.rename(columns={
    "from_node": "from_node_id",
    "to_node": "to_node_id",
})

# drop everything (for debug)
# network.links = network.links[['link_id','from_node_id','to_node_id']]

# write links
network.links.to_csv("link.csv", index=False, quoting=csv.QUOTE_NONNUMERIC)
os.system(trimcmd + "link.csv")

# write it out
print("create zip:", out_file)

with zipfile.ZipFile(out_file, "w", compression=zipfile.ZIP_DEFLATED) as f:
    f.write("config.csv")
    f.write("node.csv")
    f.write("link.csv")
