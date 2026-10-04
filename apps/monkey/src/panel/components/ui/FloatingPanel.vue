<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';

const props = withDefaults(
  defineProps<{ title?: string; initiallyExpanded?: boolean; busy?: boolean }>(),
  {
    title: '选择 Bilipack 目录',
    initiallyExpanded: false,
    busy: false
  }
);

const margin = 12;
const iconSize = 48;
const viewport = reactive({ width: window.innerWidth, height: window.innerHeight });
const size = reactive({ width: 400, height: 560 });
const position = reactive({
  x: viewport.width - iconSize - 20,
  y: viewport.height - iconSize - 20
});
const collapsed = ref(true);
const interacting = ref(false);
const motionOffset = reactive({ x: 0, y: 0 });
let suppressClick = false;
type ResizeEdge = 'top' | 'right' | 'bottom' | 'left';
type ResizeCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
type ResizeDirection = ResizeEdge | ResizeCorner;
const edges: { id: ResizeEdge; label: string }[] = [
  { id: 'top', label: '上边缘' },
  { id: 'right', label: '右边缘' },
  { id: 'bottom', label: '下边缘' },
  { id: 'left', label: '左边缘' }
];
const corners: { id: ResizeCorner; label: string }[] = [
  { id: 'top-left', label: '左上角' },
  { id: 'top-right', label: '右上角' },
  { id: 'bottom-left', label: '左下角' },
  { id: 'bottom-right', label: '右下角' }
];
let gesture:
  | {
      pointerId: number;
      handle: HTMLElement;
      mode: 'drag' | ResizeDirection;
      startX: number;
      startY: number;
      x: number;
      y: number;
      width: number;
      height: number;
      moved: boolean;
    }
  | undefined;

const limit = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));
function constrain() {
  size.width = Math.min(size.width, Math.max(iconSize, viewport.width - margin * 2));
  size.height = Math.min(size.height, Math.max(iconSize, viewport.height - margin * 2));
  position.x = limit(
    position.x,
    margin,
    viewport.width - (collapsed.value ? iconSize : size.width) - margin
  );
  position.y = limit(
    position.y,
    margin,
    viewport.height - (collapsed.value ? iconSize : size.height) - margin
  );
}
constrain();
const placement = computed(() => ({ left: `${position.x}px`, top: `${position.y}px` }));
const dimensions = computed(() => ({ width: `${size.width}px`, height: `${size.height}px` }));
// Keep the panel's geometry unchanged during its leave transition while the
// launcher takes over the same bottom-right anchor.
const panelPlacement = computed(() => ({
  left: `${position.x + (collapsed.value ? iconSize - size.width : 0)}px`,
  top: `${position.y + (collapsed.value ? iconSize - size.height : 0)}px`,
  '--panel-closed-x': iconSize / size.width,
  '--panel-closed-y': iconSize / size.height,
  '--panel-offset-x': `${motionOffset.x}px`,
  '--panel-offset-y': `${motionOffset.y}px`
}));

function expand(event?: MouseEvent) {
  if (suppressClick && event && event.detail !== 0) {
    suppressClick = false;
    return;
  }
  const anchor = { x: position.x + iconSize, y: position.y + iconSize };
  position.x += iconSize - size.width;
  position.y += iconSize - size.height;
  collapsed.value = false;
  constrain();
  // Near the top/left viewport edge the panel must move to fit; still animate
  // from the actual launcher location rather than a displaced imaginary icon.
  motionOffset.x = anchor.x - position.x - size.width;
  motionOffset.y = anchor.y - position.y - size.height;
}
function collapse() {
  motionOffset.x = 0;
  motionOffset.y = 0;
  position.x += size.width - iconSize;
  position.y += size.height - iconSize;
  collapsed.value = true;
  constrain();
}
function start(event: PointerEvent, mode: 'drag' | ResizeDirection) {
  if (event.button !== 0 || event.isPrimary === false || gesture) return;
  const handle = event.currentTarget as HTMLElement;
  if (mode === 'drag' && !collapsed.value && (event.target as Element).closest('button')) return;
  suppressClick = false;
  handle.setPointerCapture(event.pointerId);
  gesture = {
    pointerId: event.pointerId,
    handle,
    mode,
    startX: event.clientX,
    startY: event.clientY,
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
    moved: false
  };
  interacting.value = true;
}
function resize(edge: ResizeDirection, dx: number, dy: number, bounds = { ...position, ...size }) {
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  if (edge.includes('left')) {
    position.x = limit(bounds.x + dx, margin, right - Math.min(300, right - margin));
    size.width = right - position.x;
  } else if (edge.includes('right')) {
    const available = viewport.width - bounds.x - margin;
    size.width = limit(bounds.width + dx, Math.min(300, available), available);
  }
  if (edge.includes('top')) {
    position.y = limit(bounds.y + dy, margin, bottom - Math.min(240, bottom - margin));
    size.height = bottom - position.y;
  } else if (edge.includes('bottom')) {
    const available = viewport.height - bounds.y - margin;
    size.height = limit(bounds.height + dy, Math.min(240, available), available);
  }
}
function move(event: PointerEvent) {
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  const dx = event.clientX - gesture.startX,
    dy = event.clientY - gesture.startY;
  if (!gesture.moved && Math.hypot(dx, dy) < 4) return;
  gesture.moved = true;
  if (gesture.mode === 'drag') {
    position.x = gesture.x + dx;
    position.y = gesture.y + dy;
    constrain();
  } else resize(gesture.mode, dx, dy, gesture);
}
function finish(event?: PointerEvent) {
  if (!gesture || (event && gesture.pointerId !== event.pointerId)) return;
  const previous = gesture;
  gesture = undefined;
  interacting.value = false;
  suppressClick = previous.moved;
  if (previous.handle.hasPointerCapture(previous.pointerId))
    previous.handle.releasePointerCapture(previous.pointerId);
}
function resizeWithKeys(event: KeyboardEvent, edge: ResizeDirection) {
  const horizontal = edge.includes('left') || edge.includes('right');
  const vertical = edge.includes('top') || edge.includes('bottom');
  const dx = horizontal ? ({ ArrowLeft: -16, ArrowRight: 16 }[event.key] ?? 0) : 0;
  const dy = vertical ? ({ ArrowUp: -16, ArrowDown: 16 }[event.key] ?? 0) : 0;
  if (!dx && !dy) return;
  event.preventDefault();
  resize(edge, dx, dy);
}
function viewportChanged() {
  finish();
  viewport.width = window.innerWidth;
  viewport.height = window.innerHeight;
  constrain();
}
onMounted(() => {
  if (props.initiallyExpanded) expand();
  window.addEventListener('resize', viewportChanged);
});
onUnmounted(() => {
  finish();
  window.removeEventListener('resize', viewportChanged);
});
</script>

<template>
  <div
    class="floating-panel"
    :class="{ interacting }"
    @pointermove="move"
    @pointerup="finish"
    @pointercancel="finish"
    @lostpointercapture="finish"
  >
    <button
      v-if="collapsed"
      class="launcher"
      :class="{ 'tooltip-right': position.x < 100 }"
      :style="placement"
      :aria-label="busy ? 'Bilipack 正在执行，点击展开' : '打开 Bilipack'"
      :aria-busy="busy"
      aria-expanded="false"
      :data-tooltip="busy ? 'Bilipack 正在执行' : 'Bilipack'"
      @pointerdown="start($event, 'drag')"
      @click="expand"
    >
      <span v-if="busy" class="launcher-progress" aria-hidden="true"></span>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="m5 8 7-4 7 4v9l-7 4-7-4V8Z" />
        <path d="m5 8 7 4 7-4M12 12v9M8.5 6l7 4" />
      </svg>
    </button>
    <Transition name="panel-motion">
      <aside
        v-show="!collapsed"
        :inert="collapsed ? true : undefined"
        :aria-hidden="collapsed"
        aria-label="Bilipack 目录投稿助手"
        :style="{ ...panelPlacement, ...dimensions }"
      >
        <header class="drag-handle" @pointerdown="start($event, 'drag')">
          <slot name="title"
            ><strong class="panel-title" :title="title">{{ title }}</strong></slot
          >
          <div class="header-actions">
            <slot name="actions" />
            <button
              class="collapse-button"
              aria-label="收起 Bilipack"
              title="收起"
              @click="collapse"
            >
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 10h10" /></svg>
            </button>
          </div>
        </header>
        <slot name="navigation" />
        <div class="body"><slot /></div>
        <div
          v-for="edge in edges"
          :key="edge.id"
          class="resize-edge"
          :class="`resize-edge-${edge.id}`"
          role="separator"
          tabindex="0"
          :aria-label="`拖动${edge.label}调整浮窗大小`"
          :aria-orientation="edge.id === 'left' || edge.id === 'right' ? 'vertical' : 'horizontal'"
          :aria-valuenow="edge.id === 'left' || edge.id === 'right' ? size.width : size.height"
          @pointerdown="start($event, edge.id)"
          @keydown="resizeWithKeys($event, edge.id)"
        ></div>
        <div
          v-for="corner in corners"
          :key="corner.id"
          class="resize-corner"
          :class="`resize-corner-${corner.id}`"
          role="button"
          tabindex="0"
          :aria-label="`拖动${corner.label}调整浮窗大小`"
          aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
          @pointerdown="start($event, corner.id)"
          @keydown="resizeWithKeys($event, corner.id)"
        ></div>
      </aside>
    </Transition>
  </div>
</template>
