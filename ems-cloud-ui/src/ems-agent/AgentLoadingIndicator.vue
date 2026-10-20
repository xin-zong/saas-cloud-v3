<template>
  <canvas ref="canvas" class="agent-loading-indicator" aria-hidden="true" />
</template>

<script>
const SIZE = 28
const CYCLE_MS = 720
const SEGMENT_COUNT = 8

export default {
  name: 'AgentLoadingIndicator',
  data() {
    return {
      animationFrame: null,
      context: null,
      motionQuery: null,
      reducedMotion: false
    }
  },
  mounted() {
    this.setupCanvas()
    this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    this.reducedMotion = this.motionQuery.matches
    if (this.motionQuery.addEventListener) {
      this.motionQuery.addEventListener('change', this.handleMotionPreference)
    } else {
      this.motionQuery.addListener(this.handleMotionPreference)
    }
    this.startDrawing()
  },
  beforeDestroy() {
    this.stopDrawing()
    if (!this.motionQuery) return
    if (this.motionQuery.removeEventListener) {
      this.motionQuery.removeEventListener('change', this.handleMotionPreference)
    } else {
      this.motionQuery.removeListener(this.handleMotionPreference)
    }
  },
  methods: {
    setupCanvas() {
      const canvas = this.$refs.canvas
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(SIZE * pixelRatio)
      canvas.height = Math.round(SIZE * pixelRatio)
      canvas.style.width = `${SIZE}px`
      canvas.style.height = `${SIZE}px`
      this.context = canvas.getContext('2d')
      this.context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0)
    },
    handleMotionPreference(event) {
      this.reducedMotion = event.matches
      this.startDrawing()
    },
    startDrawing() {
      this.stopDrawing()
      if (this.reducedMotion) {
        this.drawFrame(0, true)
        return
      }
      this.animationFrame = window.requestAnimationFrame(this.drawFrame)
    },
    stopDrawing() {
      if (this.animationFrame == null) return
      window.cancelAnimationFrame(this.animationFrame)
      this.animationFrame = null
    },
    drawFrame(timestamp, staticFrame = false) {
      const context = this.context
      if (!context) return
      context.clearRect(0, 0, SIZE, SIZE)
      const phase = staticFrame ? 0 : (timestamp % CYCLE_MS) / CYCLE_MS * Math.PI * 2

      for (let index = 0; index < SEGMENT_COUNT; index += 1) {
        const angle = phase + index * Math.PI * 2 / SEGMENT_COUNT
        const alpha = staticFrame ? 0.52 : 0.14 + (index + 1) / SEGMENT_COUNT * 0.86
        const innerRadius = 5.5
        const outerRadius = index === SEGMENT_COUNT - 1 ? 11 : 9.5
        context.save()
        context.beginPath()
        context.moveTo(14 + Math.cos(angle) * innerRadius, 14 + Math.sin(angle) * innerRadius)
        context.lineTo(14 + Math.cos(angle) * outerRadius, 14 + Math.sin(angle) * outerRadius)
        context.strokeStyle = `rgba(23, 105, 166, ${alpha})`
        context.lineWidth = index === SEGMENT_COUNT - 1 ? 3 : 2.2
        context.lineCap = 'round'
        if (!staticFrame && index === SEGMENT_COUNT - 1) {
          context.shadowColor = 'rgba(23, 105, 166, 0.38)'
          context.shadowBlur = 4
        }
        context.stroke()
        context.restore()
      }

      if (!staticFrame && !this.reducedMotion) {
        this.animationFrame = window.requestAnimationFrame(this.drawFrame)
      }
    }
  }
}
</script>

<style scoped>
.agent-loading-indicator {
  display: block;
  width: 28px;
  height: 28px;
}
</style>
