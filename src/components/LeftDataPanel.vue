<template lang="pug">
#datapanel
  .content-area(:class="{'is-hidden': isHidden, 'bye': isLeaving}")
    .info-header(v-if="title")
      h3(style="padding: 0.5rem 3rem; font-size: 1rem; font-weight: normal; color: white;") {{ title }}

    .top-area
      slot

  .restore-button(:class="{'add-margin': !isHidden}")
    button.button.is-small.hide-button(@click="toggleHidePanel")
      i.fa.fa-arrow-left(v-if="!isHidden")
      i.fa.fa-arrow-right(v-if="isHidden")

</template>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'LeftDataPanel',
  props: {
    title: String,
  },
  data: () => {
    return {
      isHidden: false,
      isLeaving: false,
    }
  },
  methods: {
    toggleHidePanel() {
      if (this.isHidden) this.isHidden = !this.isHidden
      else {
        this.isLeaving = true
        setTimeout(() => {
          this.isHidden = true
          this.isLeaving = false
        }, 300)
      }
    },
  },
})
</script>

<style scoped lang="scss">
#datapanel {
  display: flex;
  flex-direction: row;
  z-index: 7;
  // margin: 0.5rem 0rem 0.5rem 0.5rem;
  pointer-events: none;
}

.content-area {
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.2), 0 6px 20px 0 rgba(0, 0, 0, 0.1);
  animation: 0.3s ease 0s 1 slideInFromLeft;
  pointer-events: auto;
}

.is-hidden {
  display: none;
}

.bye {
  animation: 0.3s ease 0s 1 slideOutToLeft;
}

.top-area {
  flex-grow: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  // background-color: #eeeefff4;
  background-color: #d9ddec;
  border-bottom-left-radius: 0.25rem;
  border-bottom-right-radius: 0.25rem;
  opacity: 0.97;
}

.lower-area {
  padding: 0.5rem 0.5rem;
}

.bottom-nav-bar {
  padding: 0.2rem 0rem;
  background-color: white;
  text-align: center;
  border-bottom-left-radius: 0.25rem;
  border-bottom-right-radius: 0.25rem;
}

.restore-button {
  margin: auto 0rem 0.25rem 0.25rem;
  pointer-events: auto;
  box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.2), 0 3px 10px 0 rgba(0, 0, 0, 0.1);
}

.info-header {
  text-align: center;
  background-color: #09357c;
  padding: 0.5rem 0rem;
  // border-top-left-radius: 0.25rem;
  // border-top-right-radius: 0.25rem;
  border-top: solid 1px #888;
  border-bottom: solid 1px #888;
}

.add-margin {
  margin-left: 0.4rem;
}

.hide-button {
  background-color: #4e6b3d;
  color: white;
}

@keyframes slideInFromLeft {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(0);
  }
}

@keyframes slideOutToLeft {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-100%);
  }
}

@media only screen and (max-width: 640px) {
  #datapanel {
    margin: 0rem 0rem 0rem 0rem;
  }

  .content-area {
    margin-bottom: 0rem;
  }

  .info-header {
    border-top-left-radius: 0rem;
    border-top-right-radius: 0rem;
    border-top: none;
  }

  .bottom-nav-bar {
    border-bottom-left-radius: 0rem;
    border-bottom-right-radius: 0rem;
  }
}
</style>
