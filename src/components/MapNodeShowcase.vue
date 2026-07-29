<script setup>
import { computed } from 'vue'

const props = defineProps({
  node: { type: Object, default: null },
  images: { type: Array, default: () => [] },
  layout: { type: Object, required: true },
  enterFrac: { type: Number, default: 0 },
  narrationFrac: { type: Number, default: 0 },
  exitFrac: { type: Number, default: 0 },
  stopIndex: { type: Number, required: true },
  stopCount: { type: Number, required: true },
  reducedMotion: { type: Boolean, default: false },
})

const plainNarration = computed(() => (props.node?.narration || '').replace(/<[^>]+>/g, '').trim())
const sceneOpacity = computed(() => Math.max(0, Math.min(1, props.enterFrac * (1 - props.exitFrac))))
const panelStyle = computed(() => {
  const panel = props.layout.panel
  if (!panel) return null
  return {
    left: `${panel.xPct}%`,
    top: `${panel.yPct}%`,
    width: `${panel.widthPct}%`,
    height: `${panel.heightPct}%`,
  }
})
const identityStyle = computed(() => {
  const transforms = []
  if (props.layout.identity?.align === 'right') transforms.push('translateX(-100%)')
  if (props.layout.identity?.anchorY === 'bottom') transforms.push('translateY(-100%)')
  return {
    left: `${props.layout.identity?.xPct ?? 4}%`,
    top: `${props.layout.identity?.yPct ?? 6}%`,
    textAlign: props.layout.identity?.align || 'left',
    transform: transforms.join(' ') || undefined,
  }
})
const focusedImage = computed(() => {
  let focus = props.layout.imageOrder?.[0] ?? -1
  for (const beat of props.layout.beats || []) {
    if (props.narrationFrac >= beat.at) focus = beat.focus
  }
  return focus
})

function imageBeatAt(imageIndex) {
  return (props.layout.beats || []).find((beat) => beat.focus === imageIndex)?.at ?? 0
}

function slotImageIndex(slotIndex) {
  if (props.layout.presetId === 'feature-rail' && props.layout.imageOrder.includes(focusedImage.value)) {
    return focusedImage.value
  }
  return props.layout.imageOrder[slotIndex]
}

function slotStyle(slot, imageIndex) {
  const revealAt = imageBeatAt(imageIndex)
  const local = Math.max(0, Math.min(1, (props.narrationFrac - revealAt + 0.08) / 0.08))
  const direction = {
    'right-rail': [10, 0],
    'left-rail': [-10, 0],
    'top-filmstrip': [0, -8],
    'bottom-filmstrip': [0, 8],
    'feature-rail': [10, 0],
  }[props.layout.presetId] || [0, 0]
  return {
    left: `${slot.xPct}%`,
    top: `${slot.yPct}%`,
    width: `${slot.widthPct}%`,
    height: `${slot.heightPct}%`,
    opacity: local,
    transform: props.reducedMotion
      ? 'none'
      : `translate3d(${(1 - local) * direction[0]}px, ${(1 - local) * direction[1]}px, 0)`,
  }
}
</script>

<template>
  <div
    class="map-node-showcase absolute inset-0 pointer-events-none"
    :class="[`preset-${layout.presetId}`, { 'reduce-motion': reducedMotion }]"
    :style="{ opacity: sceneOpacity }"
  >
    <div
      v-if="panelStyle"
      :key="`panel-${layout.presetId}-${stopIndex}`"
      class="material-panel absolute"
      :style="panelStyle"
    ></div>

    <div
      v-for="(slot, slotIndex) in layout.slots"
      :key="`${stopIndex}-${layout.presetId}-${slotIndex}`"
      class="showcase-photo absolute"
      :class="{ 'is-focus': slotImageIndex(slotIndex) === focusedImage }"
      :style="slotStyle(slot, slotImageIndex(slotIndex))"
    >
      <img
        v-if="images[slotImageIndex(slotIndex)]"
        :key="slotImageIndex(slotIndex)"
        :src="images[slotImageIndex(slotIndex)]"
        class="showcase-photo-image w-full h-full object-cover"
        alt=""
      />
    </div>

    <section
      v-if="node"
      :key="`identity-${layout.presetId}-${stopIndex}`"
      class="node-identity absolute"
      :style="identityStyle"
    >
      <div class="route-seq">G318 · STOP {{ String(stopIndex + 1).padStart(2, '0') }} / {{ stopCount }}</div>
      <h2>{{ node.name }}</h2>
      <div v-if="node.altitude != null" class="altitude-datum">
        <i></i><strong>{{ node.altitude }} M</strong>
      </div>
      <p v-if="node.address" class="address">{{ node.address }}</p>
      <p v-if="node.note" class="note">{{ node.note }}</p>
      <p v-if="plainNarration" class="narration">{{ plainNarration }}</p>
    </section>
  </div>
</template>

<style scoped>
.map-node-showcase {
  z-index: 10;
  transition: opacity 420ms cubic-bezier(.22, 1, .36, 1);
}

.material-panel {
  background: linear-gradient(90deg, rgba(247, 248, 243, .58), rgba(247, 248, 243, .9));
  backdrop-filter: blur(5px) saturate(.82);
  box-shadow: 0 0 42px rgba(238, 240, 232, .2);
  animation: materialEnter 1100ms cubic-bezier(.22, 1, .36, 1) both;
}
.preset-left-rail .material-panel {
  background: linear-gradient(90deg, rgba(247, 248, 243, .9), rgba(247, 248, 243, .58));
}
.preset-top-filmstrip .material-panel {
  background: linear-gradient(180deg, rgba(247, 248, 243, .9), rgba(247, 248, 243, .55));
}
.preset-bottom-filmstrip .material-panel {
  background: linear-gradient(0deg, rgba(247, 248, 243, .9), rgba(247, 248, 243, .55));
}

.showcase-photo {
  overflow: hidden;
  border: 5px solid rgba(255, 255, 255, .94);
  border-radius: 10px;
  background: rgba(237, 239, 233, .65);
  box-shadow: 0 14px 34px rgba(20, 32, 26, .2);
  filter: saturate(.78) brightness(.9);
  transition:
    opacity 520ms cubic-bezier(.22, 1, .36, 1),
    transform 620ms cubic-bezier(.22, 1, .36, 1),
    filter 600ms cubic-bezier(.22, 1, .36, 1),
    box-shadow 600ms cubic-bezier(.22, 1, .36, 1);
}
.showcase-photo.is-focus {
  filter: saturate(1) brightness(1.04);
  box-shadow: 0 18px 42px rgba(20, 32, 26, .3);
}
.showcase-photo-image {
  animation: photoSwap 900ms cubic-bezier(.22, 1, .36, 1) both;
}
@keyframes materialEnter {
  from { opacity: 0; filter: blur(9px); }
  to { opacity: 1; filter: blur(0); }
}
@keyframes photoSwap {
  from { opacity: 0; filter: blur(5px); transform: scale(.985); }
  to { opacity: 1; filter: blur(0); transform: scale(1); }
}

.node-identity {
  max-width: 38%;
  max-height: 46%;
  overflow: hidden;
  padding: 12px 15px;
  color: #17231d;
  border-radius: 10px;
  background: rgba(248, 248, 243, .78);
  backdrop-filter: blur(5px);
  box-shadow: 0 10px 28px rgba(28, 43, 35, .1);
  animation: identityEnter 900ms cubic-bezier(.22, 1, .36, 1) both;
}
@keyframes identityEnter {
  from { opacity: 0; filter: blur(5px); }
  to { opacity: 1; filter: blur(0); }
}
.route-seq {
  margin-bottom: 7px;
  color: #63716a;
  font: 700 9px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: .16em;
}
h2 {
  margin: 0;
  font: 600 clamp(24px, 3vw, 42px)/1.08 "Songti SC", "STSong", serif;
  letter-spacing: .025em;
}
.altitude-datum {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-top: 9px;
}
.altitude-datum i {
  width: 40px;
  height: 1px;
  background: #78867f;
}
.altitude-datum strong {
  font: 700 12px/1 ui-monospace, SFMono-Regular, Menlo, monospace;
  letter-spacing: .08em;
}
.address, .note, .narration {
  margin: 7px 0 0;
  color: #536059;
  font-size: 11px;
  line-height: 1.55;
}
.note { color: #34433b; }
.narration {
  display: -webkit-box;
  overflow: hidden;
  max-width: 560px;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.reduce-motion .showcase-photo,
.reduce-motion .showcase-photo-image,
.reduce-motion .material-panel,
.reduce-motion .node-identity,
.reduce-motion {
  animation: none;
  transition: opacity 1ms linear;
}
</style>
