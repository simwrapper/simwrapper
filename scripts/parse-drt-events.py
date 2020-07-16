# Parse the event file containing activity start/end times and infection events.
# - Link events are not needed -- people float between activities.
# - Time between actend and actstart is travel time for the trip
#
# Produces 3js.json, format:
# [
#    { id: string,                   # person_id
#      time: [number...],            # array of trip time points, in seconds
#      points: [ (x,y)...],          # array of (x,y) coordinates for time points
#      disease_time: [number...],    # array of disease event time points
#      disease: [code...]            # array of disease status codes, see below
#    }
# ]

try:
    import ndjson
    import sys
    import matsim
    from dfply import *
except:
    print("OOPS! Error importing required libraries.")
    print('try "pip install matsim-tools ndjson dfply"')

# outfile hard-coded for now
outfile = "drt-vehicles.json"

print("reading network", sys.argv[1])
network = matsim.read_network(sys.argv[1])

# Build link x/y lookup -- use 'to_node' (endpoint) of link
nodes = network.nodes >> mutate(to_node=X.node_id)
links = network.links >> inner_join(nodes, by="to_node") >> select(X.link_id, X.x, X.y)

link_coords = {}
for link in links.values:
    link_coords[link[0]] = (float(link[1]), float(link[2]))

print("reading events", sys.argv[2])
events = matsim.event_reader(sys.argv[2], types="actstart,actend")

# lookups by person's health status, coords, and timepoints
agents = {}

act_ends = {}
cur_location = {}

for event in events:
    # only interested in DRT vehicle events
    if event["actType"] != "DrtBusStop":
        continue

    person_id = event["person"]
    time = int(event["time"])

    # create a hollow person
    if person_id not in agents:
        agents[person_id] = {"id": person_id, "trips": []}

    person = agents[person_id]

    if event["type"] == "actend":
        # activity end means trip begins
        act_ends[person_id] = time
        cur_location[person_id] = link_coords[event["link"]]

    if event["type"] == "actstart":
        # activity start means trips ends
        end_loc = link_coords[event["link"]]

        if person_id in cur_location:
            # we have a location/time, create a trip
            start_loc = cur_location[person_id]

            coords = [start_loc, end_loc]

            # don't save stupid trips
            saveTrip = True
            if start_loc[0] == end_loc[0] and start_loc[1] == end_loc[1]:
                saveTrip = False
            if time == act_ends[person_id]:
                saveTrip = False

            # save it
            if saveTrip:
                person["trips"].extend(
                    [(act_ends[person_id], coords[0]), (time, coords[1])]
                )

        # we're at an activity, so park at this location until the next trip
        cur_location[person_id] = end_loc

# get everything sorted
for person in agents.values():
    # print(person, "\n")
    person["trips"] = sorted(person["trips"], key=lambda k: k[0])
    person["time"] = [t[0] for t in person["trips"]]
    person["path"] = [t[1] for t in person["trips"]]
    del person["trips"]

# write it out
with open(outfile, "w") as f:
    writer = ndjson.writer(f, separators=(",", ":"))
    for agent in agents.values():
        writer.writerow(agent)

print(len(agents), "agents written.")
