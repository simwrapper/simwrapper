<template lang="pug">
#colophon-content
  .logo(style="width: 100%;")
    a(href='https://www.vsp.tu-berlin.de' target="_blank")
      img(src="@/assets/images/tu-logo.png")
  .professor Kai Nagel, Professor

  .team COVID-19 Team

  p Billy Charlton
  p Ricardo Ewert
  p Ihab Kaddoura
  p Sebastian Müller
  p Christian Rakow
  p Tilmann Schlenther

  .team MATSim-EpiSim

  p: a(href="https://github.com/matsim-org/matsim-episim") Source code

  .team Contact

  p.nonbreak: a(href="mailto:covid19@vsp.tu-berlin.de") covid19@vsp.tu-berlin.de

  .team Partners

  p: a(href='https://senozon.com' target="_blank") Senozon Deutschland GmbH

  .team Supported By
  a(href='https://bmbf.de' target="_blank")
    img(src="@/assets/images/bmbf-logo.png")

</template>

<script lang="ts">
export default {
  name: 'Colophon',
  components: {},
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

#colophon-content {
  padding-top: 2rem;
  width: min-content;
}

.colophon .professor {
  width: max-content;
  margin: 1rem 0 1rem auto;
  font-weight: bold;
  color: $bannerHighlight;
}

.colophon .team {
  margin-top: 1.5rem;
  margin-bottom: 0.25rem;
  font-weight: bold;
  color: $bannerHighlight;
}

.colophon p {
  margin-bottom: 0px;
}

.colophon a {
  font-size: 0.85rem;
}

.nonbreak {
  width: max-content;
  margin-left: auto;
}

@media only screen and (max-width: 640px) {
}
</style>
