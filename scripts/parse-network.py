#!/usr/bin/env python3.7
# -*- coding: utf-8 -*-
#
try:
    import sys
    import json
    import matsim

except:
    print("Requires pandas and dfply modules.")
    print("You can install them with:  pip install pandas dfply")
    sys.exit(1)

if len(sys.argv) != 2:
    print("Usage:  python parse-network.py [network.xml.gz]")
    sys.exit(1)

print("Reading network:", sys.argv[1])

net = matsim.read_network(sys.argv[1])
print(net)

out = {"nodes": [], "links": []}

for _, node in net.nodes.iterrows():
    out["nodes"].append(
        {"node_id": node["node_id"], "x": round(node["x"]), "y": round(node["y"])}
    )

for _, link in net.links.iterrows():
    if link["modes"].find("pt") > -1:
        continue

    out["links"].append({"from_node": link.from_node, "to_node": link.to_node})


# write it out
with open("network2.json", "w") as f:
    json.dump(out, f, separators=(",", ":"))

print("--Done!")
