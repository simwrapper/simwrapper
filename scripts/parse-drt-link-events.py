# Parse the event file containing activity start/end times and infection events.
# - Link events are used so paths are correct
# - Time between actend and actstart is travel time for the trip

try:
    import sys
    import ndjson
    import matsim
    from dfply import *
    from pyproj import Transformer
except Exception as e:
    print("OOPS! Error importing required libraries.")
    print('try "pip3 install matsim-tools ndjson dfply pyproj"')
    print('older ubuntu version may require "pip3 install pyproj==2.6.1"')
    print('===exception===')
    print(e)
    sys.exit(1)

if len(sys.argv) != 4:
    print(
        "USAGE:  python parse-drt-link-events.py  [network]  [events]  [coord-system]"
    )
    sys.exit(1)

# outfile hard-coded for now
out_paths = "drt-vehicles.json"
out_requests = "drt-requests.csv"

p_network = sys.argv[1]
p_events = sys.argv[2]
p_coords = sys.argv[3]

coord_transformer = Transformer.from_crs(p_coords, "EPSG:4326")

print("reading network:", p_network)
network = matsim.read_network(p_network)

# Build link x/y lookup
nodes = network.nodes >> mutate(to_node=X.node_id, from_node=X.node_id)
links = (
    network.links
    >> inner_join(nodes, by="from_node")
    >> select(X.link_id, X.from_node, X.to_node_x, X.x, X.y)
    >> mutate(x0=X.x, y0=X.y, to_node=X.to_node_x)
    >> inner_join(nodes, by="to_node")
    >> select(X.link_id, X.x0, X.y0, X.x_y, X.y_y)
)

link_coords = {}
for link in links.values:
    link_coords[link[0]] = (
        float(link[1]),
        float(link[2]),
        float(link[3]),
        float(link[4]),
    )

print("reading events:", p_events)
events = matsim.event_reader(
    p_events,
    types="entered link,left link,vehicle enters traffic,vehicle leaves traffic,PersonEntersVehicle,PersonLeavesVehicle,DrtRequest submitted,PassengersRequest scheduled",
)

# lookups by person's health status, coords, and timepoints
agents = {}
drt_requests = {}
drt_request_list = []

for event in events:
    # only interested in (1) DRT requests and (2) DRT vehicle events
    if event["type"] == "DrtRequest submitted":
        coord = link_coords[event["fromLink"]]
        x, y = (0.5 * (coord[0] + coord[2]), 0.5 * (coord[1] + coord[3]))
        lat, lon = coord_transformer.transform(x, y)
        coord_from = [round(lon, 5), round(lat, 5)]

        coord = link_coords[event["toLink"]]
        x, y = (0.5 * (coord[0] + coord[2]), 0.5 * (coord[1] + coord[3]))
        lat, lon = coord_transformer.transform(x, y)
        coord_to = [round(lon, 5), round(lat, 5)]

        drt_requests[event["person"]] = [
            event["time"],
            coord_from[0],
            coord_from[1],
            coord_to[0],
            coord_to[1],
        ]
        continue

    elif event["type"] == "PassengersRequest scheduled":
        drt_requests[event["person"]].append(event["vehicle"])

    elif "vehicle" in event and not "drt" in event["vehicle"]:
        continue

    person_id = event["vehicle"]
    time = int(event["time"])

    # create a hollow person: -1 passengers because driver doesn't count
    if person_id not in agents:
        agents[person_id] = {"id": person_id, "trips": [], "passengers": -1}

    person = agents[person_id]

    if "link" in event:
        link = link_coords[event["link"]]

    # Pickup/Dropoff
    if event["type"] == "PersonEntersVehicle":
        person["passengers"] += 1

    elif event["type"] == "PersonLeavesVehicle":
        person["passengers"] -= 1
        if person["passengers"] < -1:
            person["passengers"] = -1
            print("whoops, very negative occupancy", person_id)
        if event["person"] in drt_requests:
            drt_requests[event["person"]].append(event["time"])
            drt_request_list.append(drt_requests[event["person"]])
            del drt_requests[event["person"]]

    # enters traffic: guess it's at midpoint of link
    elif event["type"] == "vehicle enters traffic":
        midpoint = [0.5 * (link[0] + link[2]), 0.5 * (link[1] + link[3])]
        person["trips"].append((time, midpoint, person["passengers"]))

    elif event["type"] == "entered link":
        # start-node
        start = [link[0], link[1]]
        # don't dupe previous node
        prevTime, prevLocation, passengers = person["trips"][-1]

        if (
            time != prevTime
            or start[0] != prevLocation[0]
            or start[1] != prevLocation[1]
        ):
            person["trips"].append((time, start, person["passengers"]))

    elif event["type"] == "left link":
        # end-node
        person["trips"].append((time, [link[2], link[3]], person["passengers"]))

    elif event["type"] == "vehicle leaves traffic":
        midpoint = [0.5 * (link[0] + link[2]), 0.5 * (link[1] + link[3])]
        person["trips"].append((time, midpoint, person["passengers"]))


# get everything sorted and converted

for person in agents.values():
    # print(person, "\n")
    person["trips"] = sorted(person["trips"], key=lambda k: k[0])
    person["timestamps"] = [t[0] for t in person["trips"]]
    person["path"] = [t[1] for t in person["trips"]]
    person["passengers"] = [t[2] for t in person["trips"]]
    person["vendor"] = 0
    del person["trips"]

    # convert coords to lat/lon
    latlon = []
    for x, y in person["path"]:
        lat, lon = coord_transformer.transform(x, y)
        answer = [round(lon, 5), round(lat, 5)]
        latlon.extend([answer])
    person["path"] = latlon

# some requests went unanswered?
unanswered = list(drt_requests.values())
if len(unanswered) > 0:
    print("Unanswered requests: ", len(unanswered))
    print(unanswered)

abandoned = map(lambda x: x + [-1], drt_requests.values())
drt_request_list.extend(abandoned)

# sort requests by request time
drt_requests = sorted(drt_request_list)

# write it out
print("Writing:", out_paths)
with open(out_paths, "w") as f:
    f.writelines('{"trips": [\n')
    writer = ndjson.writer(f, separators=(",", ":"))
    for i, agent in enumerate(agents.values()):
        writer.writerow(agent)
        if i < len(agents) - 1:
            f.writelines(",")
    f.writelines("],\n")

    f.writelines('"drtRequests": [\n')
    for i, request in enumerate(drt_requests):
        writer.writerow(request)
        if i < len(drt_requests) - 1:
            f.writelines(",")

    f.writelines("]\n}\n")

print(len(agents), "vehicle paths written.")
print(len(drt_requests), "drt requests written.")
