#!/usr/bin/env python3

# matsim network converter -> GMNS
# this does NOT convert coordinates: They are kept in their original coordinate system
# The GMNS npm library will convert this to proper 4326 (lng/lat) coordinates

try:
    import sys, zipfile, csv, os
    import matsim
    import pandas
    from dfply import *
except:
    print("OOPS! Error importing required libraries.")
    print('try "pip3 install pandas dfply matsim-tools"')

if len(sys.argv) < 3:
    print(
        "USAGE:  python convert-matsim-to-gmns-network.py  [network]  [coord-system] (optional linkGeometries)"
    )
    sys.exit(1)

p_network = sys.argv[1]
p_coords = sys.argv[2]
p_geom = len(sys.argv) > 3 and sys.argv[3] or None

out_file = p_network + ".gmns.zip"

if not p_geom: print("--- No link geometries specified. Stick network will be generated.")

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

network.links['geometry_id'] = network.links['link_id']

# drop everything (for debug)
# network.links = network.links[['link_id','from_node_id','to_node_id']]

# write links
network.links.to_csv("link.csv", index=False, quoting=csv.QUOTE_NONNUMERIC)
os.system(trimcmd + "link.csv")

# ----- geometry
if p_geom:
    print("Reading geometry")
    geom = pandas.read_csv(p_geom)
    geom['wkt'] = geom['Geometry'].apply(lambda g: (
        'LINESTRING ' + ",".join([item.replace(',',' ') for item in g.split("),(")])
    ))

    del geom['Geometry']

    geom = geom.rename(columns={
    "LinkId": "geometry_id",
    "wkt": "geometry",
    })

    # write geom
    geom.to_csv("geometry.csv", index=False, quoting=csv.QUOTE_NONNUMERIC)
    os.system(trimcmd + "geometry.csv")


# write it out
print("create zip:", out_file)

with zipfile.ZipFile(out_file, "w", compression=zipfile.ZIP_DEFLATED) as f:
    f.write("config.csv")
    f.write("node.csv")
    f.write("link.csv")
    if p_geom: f.write("geometry.csv")

