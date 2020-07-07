<template lang="pug">
#home
  .banner
    h2 VSP / Technische Universität Berlin
    h3 AVÖV Projekt Portal

  .page-area
    .content
      .main
        p.headline AVÖV Projekt blabla bla Willkommen

        .readme(v-html="readme")

        h2 Projekte

        svn-projects

        //- h2 Interactive Visualizations

        //- p The following interactive visualizations help to illustrate the method and results which emerge from the model. These are produced directly from simulated model results. Note that due to the advanced nature of the visualizations, only modern versions of recent web browsers are supported.

        //- .viz-cards
        //-   .one-viz(v-for="viz in visualizations" :key="viz.url")
        //-     router-link(:to="viz.url")
        //-       viz-card(:viz="viz")

        h2 Bottom Page Extra Info

        .readme(v-html="readmeBottom")

        .footer(v-if="!state.isFullScreen")
          //- colophon.colophon
          a(href="https://vsp.tu-berlin.de")
            img(alt="TU-Berlin logo" src="@/assets/images/vsp-logo.png" width=225)
          a(href="https://matsim.org")
            img(alt="MATSim logo" src="@/assets/images/matsim-logo-blue.png" width=250)


</template>

<script lang="ts">
const readme = require('@/assets/info-top.md')
const bottom = require('@/assets/info-bottom.md')

import Colophon from '@/components/Colophon.vue'
import VizCard from '@/components/VizCard.vue'
import SvnProjects from '@/components/SVNProjects.vue'

import globalStore from '@/store'

export default {
  name: 'Home',
  components: { Colophon, SvnProjects, VizCard },
  data: function() {
    return {
      state: globalStore.state,
      readme,
      readmeBottom: bottom,
      visualizations: [
        {
          url: '/v3?day=5',
          title: 'Infection Traces',
          subtitle: 'Animation of infection spreading through the population.',
        },
      ],
      methods: {
        mounted: () => {
          globalStore.commit('setBreadCrumbs', [])
        },
      },
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
  padding: 2rem 3rem 5rem 3rem;
  display: flex;
  width: 100%;
}

.banner {
  display: flex;
  flex-direction: column;
  padding: 4rem 3rem 1rem 3rem;
  background-color: #ffffff;
  color: $tuRed;
  background: url(../assets/images/banner.jpg);
  background-repeat: no-repeat;
  background-size: cover;
}

.banner h2 {
  margin-bottom: 0rem;
  font-size: 1.6rem;
  background-color: white;
  line-height: 1.7rem;
  margin-right: auto;
  padding: 0 0.5rem;
}

.banner h3 {
  font-size: 1.3rem;
  font-weight: normal;
  margin-bottom: 0;
  line-height: 1.4rem;
  padding: 0.25rem 0.5rem;
  background-color: white;
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

#app .footer {
  color: #222;
  background-color: white;
  text-align: center;
  padding: 2rem 0.5rem 3rem 0.5rem;
  // background-color: #648cb4;
}

.footer a {
  color: $matsimBlue;
}

.footer img {
  margin: 1rem auto;
  padding: 0 1rem;
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
