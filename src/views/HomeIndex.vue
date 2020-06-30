<template lang="pug">
#home
  .banner
    h2 VSP / Technische Universität Berlin
    h3 COVID-19 Analysis Portal

  .page-area
    colophon.colophon
    .content
      .main
        .top
          p.headline We build advanced human mobility models, and attach virus infection dynamics taken from recent literature and publications.
            br
            | This results in a virus spreading dynamics model.

          p This site is the central hub for COVID-19 virus spreading research from the Transport Systems Planning and Transport Telematics group (VSP), Institute for Land and Sea Transport at TU Berlin. This research uses the&nbsp;
            a(href="https://github.com/matsim-org/matsim-episim")
              b MATSim-Episim
            | &nbsp;virus spreading model.

          h2 Method: Mobility traces and the spreading of COVID-19
          p The MATSim-Episim virus spreading dynamics model is described in this paper:
            br
            a(href="https://dx.doi.org/10.14279/depositonce-9835") https://dx.doi.org/10.14279/depositonce-9835 .

          p The code is freely available and open source:
            br
            a(href="https://github.com/matsim-org/matsim-episim") https://github.com/matsim-org/matsim-episim .

        h2 Interactive Visualizations

        p The following interactive visualizations help to illustrate the method and results which emerge from the model. These are produced directly from simulated model results. Note that due to the advanced nature of the visualizations, only modern versions of recent web browsers are supported.

        .viz-cards
          .one-viz(v-for="viz in visualizations" :key="viz.url")
            router-link(:to="viz.url")
              viz-card(:viz="viz")

        h2 Simulations of COVID-19 spreading in Berlin

        .readme(v-html="readme")

        .viz-cards
          .one-viz(v-for="viz in modelruns" :key="viz.url")
            router-link(:to="viz.url")
              viz-card(:viz="viz")

        .readme(v-html="readmeBottom")

</template>

<script lang="ts">
const readme = require('@/assets/index.md')
const bottom = require('@/assets/index-bottom.md')

import Colophon from '@/components/Colophon.vue'
import VizCard from '@/components/VizCard.vue'

export default {
  name: 'Home',
  components: { Colophon, VizCard },
  data: function() {
    return {
      readme,
      readmeBottom: bottom,
      visualizations: [
        {
          url: '/v3?day=5',
          title: 'Infection Traces',
          subtitle: 'Animation of infection spreading through the population.',
        },
      ],
      modelruns: [
        {
          url: '/2020-06-19',
          date: 'Released: 19 June 2020',
          title: 'Run 2020.06.19',
          subtitle:
            'Closing of educational facilities; reduced activities and public transport; masks; contact tracing.',
        },
        {
          url: '/2020-06-05',
          date: 'Released: 19 June 2020',
          title: 'Run 2020.06.05',
          subtitle: 'Contact tracing and school reopenings',
        },
        {
          url: '/v9/masks/berlin',
          date: 'Released: 11 May 2020',
          title: 'v9: Masks',
          subtitle: 'Impact of different types of masks and their usage levels',
        },
        {
          url: '/v9/tracing2/berlin',
          date: 'Released: 11 May 2020',
          title: 'v9: Contact Tracing',
          subtitle: 'Part 2: More contact tracing options',
        },
        {
          url: '/v8/masks',
          date: 'Released: 11 May 2020',
          title: 'v8: Masks',
          subtitle: 'Impact of different types of masks and their usage levels',
        },
        {
          url: '/v7',
          date: 'Released: 22 April 2020',
          title: 'School Reopening Options (3)',
          subtitle:
            'Select adherence rates for stay-at-home and explore re-opening options for kindergarten/schools/universities.',
        },
        {
          url: '/v5',
          date: 'Updated: 6 April 2020',
          title: 'School Reopening Options (2)',
          subtitle:
            'Select adherence rates for stay-at-home and explore re-opening options for kindergarten/schools/universities.',
        },
        {
          url: '/v4',
          date: 'Released: 1 April 2020',
          title: 'School Reopening Options (1)',
          subtitle:
            'Explore re-opening of kindergarten, primary and secondary school, and universities.',
        },
        {
          url: '/v2',
          date: 'Updated: 28 March 2020',
          title: 'Adherence Rates',
          subtitle:
            'How COVID-19 spreads under various levels of adherence for work, shopping, leisure restrictions.',
        },
        {
          url: '/v1',
          date: 'Updated: 25 March 2020',
          title: 'Intervention Strategies',
          subtitle: 'Exploring the effects of several stay-at-home interventions..',
        },
      ],
    }
  },
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

#home {
  background-color: $paleBackground;
}

.content {
  flex: 1;
  padding: 2rem 3rem 8rem 3rem;
  display: flex;
  width: 100%;
}

.banner {
  display: flex;
  flex-direction: column;
  padding: 4rem 3rem 1rem 3rem;
  background-color: #1e1f2c;
  color: white;
  background: url(../assets/images/banner.jpg);
  background-repeat: no-repeat;
  background-size: cover;
}

.banner h2 {
  margin-bottom: 0rem;
  font-size: 1.6rem;
  background-color: #1e1f2c;
  line-height: 1.6rem;
  margin-right: auto;
}

.banner h3 {
  font-size: 1.3rem;
  font-weight: normal;
  margin-bottom: 0;
  line-height: 1.4rem;
  padding-bottom: 0.25rem;
  background-color: #1e1f2c;
  width: max-content;
}

a {
  font-size: 1.1rem;
  color: #00499c;
}

.readme {
  margin-top: 1rem;
  margin-bottom: 3rem;
  flex: 1;
}

.main h2 {
  margin-top: 3rem;
  font-weight: normal;
  color: $bannerHighlight;
}

.viz-cards {
  padding-bottom: 1rem;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: 2rem;
}

.one-viz {
  margin-bottom: 1rem;
}

.preamble {
  display: flex;
}

.top {
  margin-top: 1rem;
}

.colophon {
  padding: 2rem 2rem 1rem 5rem;
  text-align: right;
  font-size: 0.85rem;
  background-color: white;
}

.main {
  max-width: 64rem;
}

.main .top a {
  font-size: 0.9rem;
}

.page-area {
  display: flex;
  flex-direction: row-reverse;
}

.headline {
  font-size: 2rem;
  line-height: 2.7rem;
  padding: 1rem 0;
  color: $themeColor;
}

@media only screen and (max-width: 640px) {
  .banner {
    padding: 2rem 1rem;
  }

  .content {
    padding: 2rem 1rem 8rem 1rem;
    flex-direction: column-reverse;
  }

  .colophon {
    display: none;
  }

  .headline {
    padding: 0rem 0rem 1rem 0rem;
    font-size: 1.5rem;
    line-height: 1.8rem;
  }
}
</style>
