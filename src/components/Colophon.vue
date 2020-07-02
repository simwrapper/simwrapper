<template lang="pug">
#colophon-content
  .logo(style="width: 100%;")
    a(href='https://www.vsp.tu-berlin.de' target="_blank")
      img(src="@/assets/images/tu-logo.png")
  .professor Kai Nagel, Professor

  .team AVÖV Team

  p Ihab Kaddoura
  p Gregor Leich
  p Billy Charlton


  .team Contact

  p.nonbreak: a(href="mailto:sekretariat@vsp.tu-berlin.de") Email us

  .team Partners

  // p: a(href='https://senozon.com' target="_blank") Senozon Deutschland GmbH
  p to be added

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
