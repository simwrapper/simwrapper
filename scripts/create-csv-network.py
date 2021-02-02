# VSP matsim network reader - creates a CSV from an output.xml.gz file
# Node attributes are ignored.
try:
    import sys, json, gzip
    import matsim
    from dfply import *
except:
    print("OOPS! Error importing required libraries.")
    print('try "pip3 install matsim-tools dfply"')

if len(sys.argv) != 2:
    print(
        "USAGE:  python3 create-csv-network.py  [network]"
    )
    sys.exit(1)

p_network = sys.argv[1]
out_file = p_network.replace(".xml.gz", ".csv")

print("reading network:", p_network)
network = matsim.read_network(p_network)

# Build link x/y lookup
nodes = network.nodes >> mutate(to_node=X.node_id, from_node=X.node_id)

link_coords = (
    network.links
    >> inner_join(nodes, by="from_node")
    >> mutate(x0=X.x, y0=X.y, to_node=X.to_node_x)
    >> inner_join(nodes, by="to_node")
    >> select(X.link_id, X.x0, X.y0, X.x_y, X.y_y)
)

# convert coords to lat/lon
wkt = []
for link in link_coords.values:
    wkt.append(f"LINESTRING ({link[1]} {link[2]}, {link[3]} {link[4]})")

# append wkt to the dataframe
links = network.links >> mutate(wkt = wkt)

# write it out
print("Writing:", out_file)
links.to_csv(out_file, index=False )

print(len(links.values), "links written.")
