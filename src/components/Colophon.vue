<template lang="pug">
#colophon-content
  .logo(style="width: 100%;")
    a(href='https://www.vsp.tu-berlin.de' target="_blank")
      img(src="@/assets/images/tu-logo.png")
  .professor Kai Nagel, Professor

  .team TU AVÖV Team

  p Ihab Kaddoura
  p Gregor Leich
  p Billy Charlton


  .team Contact

  p.nonbreak: a(href="mailto:sekretariat@vsp.tu-berlin.de") Email

  .team Projektpartner

  .partners
    p: a(href='https://www.uni-due.de/' target="_blank") Universität<br/>Duisburg-Essen
    p: a(href='https://www.bvg.de/' target="_blank") Berliner&nbsp;Verkehrsbetriebe&nbsp;(BVG)
    p: a(href='https://senozon.com' target="_blank") Senozon Deutschland GmbH

  a(href='https://www.bmvi.de' target="_blank")
    img(src="@/assets/images/logo-bmvi.png")

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
  width: 16rem;
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

.partners {
  margin-bottom: 2rem;

  p {
    line-height: 1rem;
    padding-top: 0.75rem;
  }
}

.nonbreak {
  width: max-content;
  margin-left: auto;
}

@media only screen and (max-width: 640px) {
}
</style>
