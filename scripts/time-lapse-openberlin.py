# TIME LAPSE infection parser
#
# Parse the infectionEvent file along with the population file
# in order to build a time-lapse of infections
#
# Produces time-lapse.json, in NDJSON format
import matsim
import csv

# persistent memory of agent health status
agents = {}

# disease status numeric codes
disease_code = {
    "susceptible": 0,
    "infectedButNotContagious": 1,
    "contagious": 2,
    "showingSymptoms": 3,
    "seriouslySick": 4,
    "critical": 5,
    "recovered": 6,
}

# and the other way
code_disease = [
    "susceptible",
    "infectedButNotContagious",
    "contagious",
    "showingSymptoms",
    "seriouslySick",
    "critical",
    "recovered",
]

# outfile hard-coded for now
fOut = "time-lapse.csv"

# we only care about infection
whichEvents = "episimPersonStatus,actstart,actend"

for day in range(0, 92):
    print(f"Processing day {day}")

    events = matsim.event_reader(f"day_{day:03d}.xml.gz", types=whichEvents)

    # lookups by person's health status, coords, and timepoints

    act_ends = {}
    cur_location = {}

    for event in events:
        person_id = event["person"]
        if person_id.startswith("freight"):
            continue

        # create a hollow person
        if person_id not in agents:
            agents[person_id] = [person_id, 0, 0, 0, 0, 0, 0, 0, 0]  # id,x,y

        person = agents[person_id]

        if event["type"] == "episimPersonStatus":
            disease = event["diseaseStatus"]
            code = disease_code[disease]
            # save infection event - code is array index!
            person[2 + code] = day + 1

        if event["type"] == "actstart":
            # activity start means trips ends
            x = round(float(event["x"]))
            y = round(float(event["y"]))

            # save person's coord -- the last coord wins!
            person[1] = x
            person[2] = y

# can't filter people
agents = agents.values()

print(f"--{len(agents)} total peeples")

# write out the infections - every day
with open(fOut, "w", newline="") as f:
    writer = csv.writer(f, delimiter=",")  # nospace
    a = ["id", "x", "y"]
    a.extend(code_disease[1:])
    writer.writerow(a)
    for agent in agents:
        writer.writerow(agent)

print(f"DONE!")
