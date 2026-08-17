<script lang="ts">
  import { contextUsage } from '@/store/context-usage-store'
  import { format, t } from '@/i18n'

  let {
    size = 16,
    strokeWidth = 3,
  } = $props<{ size?: number; strokeWidth?: number }>()

  const state = $derived($contextUsage)
  const radius = $derived((size - strokeWidth) / 2)
  const circumference = $derived(2 * Math.PI * radius)
  const dashOffset = $derived(circumference * (1 - state.percent))
  const statusClass = $derived(
    !state.totalKnown
      ? 'unknown'
      : state.percent >= 0.9
        ? 'danger'
        : state.percent >= 0.7
          ? 'warn'
          : 'normal',
  )
  const title = $derived(
    !state.totalKnown
      ? t.chat.contextUsageUnknown
      : state.source === 'api'
        ? format(t.chat.contextUsage, {
            used: Math.round(state.usedTokens).toLocaleString(),
            total: Math.round(state.totalTokens).toLocaleString(),
            percent: Math.round(state.percent * 100),
          })
        : format(t.chat.contextUsageEstimated, {
            used: Math.round(state.usedTokens).toLocaleString(),
            total: Math.round(state.totalTokens).toLocaleString(),
            percent: Math.round(state.percent * 100),
          }),
  )
</script>

<div
  class="typ-context-ring {statusClass}"
  style="width: {size}px; height: {size}px;"
  role="img"
  {title}
  aria-label={title}
>
  <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
    <circle
      class="typ-context-ring__track"
      cx={size / 2}
      cy={size / 2}
      r={radius}
      fill="none"
      stroke-width={strokeWidth}
    />
    <circle
      class="typ-context-ring__bar"
      cx={size / 2}
      cy={size / 2}
      r={radius}
      fill="none"
      stroke-width={strokeWidth}
      stroke-linecap="round"
      stroke-dasharray={circumference}
      stroke-dashoffset={dashOffset}
      transform={`rotate(-90 ${size / 2} ${size / 2})`}
    />
  </svg>
</div>

<style>
  .typ-context-ring {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    cursor: default;
  }

  .typ-context-ring svg {
    display: block;
  }

  .typ-context-ring__track {
    stroke: rgb(var(--typ-color-gray-1));
  }

  .typ-context-ring__bar {
    transition:
      stroke-dashoffset 0.2s ease,
      stroke 0.2s ease;
    stroke: var(--primary-color, rgb(30, 136, 229));
  }

  .typ-context-ring.warn .typ-context-ring__bar {
    stroke: #f5a623;
  }

  .typ-context-ring.danger .typ-context-ring__bar {
    stroke: rgb(var(--typ-color-red-3));
  }

  .typ-context-ring.unknown .typ-context-ring__bar {
    stroke: rgb(var(--typ-color-gray-3));
    opacity: 0.35;
  }
</style>
