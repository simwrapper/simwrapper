### Congestion-free centralized routing
This strategy assumes that there will, at least ultimately, be some form of centralised communications where automated vehicles will transmit their intended destination, getting feedback on road conditions and expected travel times, as well as a route recommendation, that will result in optimal system-wide travel times and minimum congestion.

    To illustrate the concept, we reduce all non-motorway links in Duesseldorf by one lane, and have the simulator produce near-optimal routes resulting in minimal overall delay.

    ![Decongestion](https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/duesseldorf/projects/komodnext/website/v1.7/img/decongestion.jpg)

### Geo-fenced speed enforcement
Assuming that the system will allow some form of governance over the behaviour of automated vehicles, at least from a safety perspective, governing their maximum speed on different road grades, it becomes possible to coax the entire vehicle population to stick to the road hierarchy as far as possible, avoiding the interior of neighbourhoods. In the example we combine both the control over flow characteristics, and maximum speed by road grade, to produce an outcome where we match baseline performance, yet have very low density of vehicles on neighbourhood streets, with concomitant noise pollution and safety benefits.

![superblock](https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/duesseldorf/projects/komodnext/website/v1.7/img/superblock.jpg)

Decongestion routing will produce a set of routes for all vehicles on the road such that overall congestion is minimised, at the cost of some users not being allocated a shortest path route. However, as commuters will have already agreed to let the machine drive, their

However, this form of routing present several benefits to planers and operators:
- minimising traffic density across the city (less noise, increased safety)
- counteracting any unanticipated effects from deploying other strategies, e.g. an over-zealous reclamation of road space.
- A contingency strategy to rebound effects, as other options are explored
With, or without reclamation of road space,
To counter any possible effects of

    This corridor is simulated for both a conservative outlook, where safety concerns trump all other considerations, likely at the very start of deployment)
