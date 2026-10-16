import { useLayoutEffect, useRef, useState } from 'react'
import type { ViewportController } from '../canvas/ViewportController.ts'
import type { Point } from '../canvas/types.ts'
import type { SceneStore } from './store.ts'
import { componentRoot } from './components.ts'
import { measurementHit } from './measurementGeometry.ts'
import { getEffectiveStateMachine, resolveNextState } from './stateMachine.ts'
import { springCSS, springDuration } from '../prototype/spring.ts'
import type { ComponentLink, ComponentStateMachine, ComponentStateTransition, SceneElement } from './types.ts'

type InstanceElement = SceneElement & {
  component: Extract<ComponentLink, { kind: 'instance' }>
}

export function InteractiveCanvasOverlay({
  store,
  controller,
  onExit,
}: {
  store: SceneStore
  controller: ViewportController
  onExit?: () => void
}) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const hoveredInstanceId = useRef<string | null>(null)
  const pressedInstanceId = useRef<string | null>(null)
  const originalStates = useRef<Map<string, string | null>>(new Map())
  const activeTransitions = useRef<Map<string, number>>(new Map())
  const [hoveredBadge, setHoveredBadge] = useState<{ id: string; name: string; state: string } | null>(null)

  // Apply spring styling to instance DOM node
  const applySpringStyle = (instanceId: string, transition: ComponentStateTransition) => {
    const element = document.querySelector<HTMLElement>(`[data-element-id="${instanceId}"]`)
    if (!element) return
    const duration = springDuration(transition.spring)
    const easing = springCSS(transition.spring, duration)
    element.style.transition = `all ${duration}ms ${easing}`
    const oldTimeout = activeTransitions.current.get(instanceId)
    if (oldTimeout) window.clearTimeout(oldTimeout)
    const timeout = window.setTimeout(() => {
      element.style.transition = ''
      activeTransitions.current.delete(instanceId)
    }, duration + 50)
    activeTransitions.current.set(instanceId, timeout)
  }

  useLayoutEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return

    const worldPoint = (event: PointerEvent): Point => {
      const rect = overlay.getBoundingClientRect()
      return controller.screenToWorld({ x: event.clientX - rect.left, y: event.clientY - rect.top })
    }

    const findInstance = (event: PointerEvent): { root: InstanceElement; master: SceneElement; machine: ComponentStateMachine } | null => {
      const snapshot = store.getSnapshot()
      const hit = measurementHit(snapshot, worldPoint(event), true)
      if (!hit) return null
      const root = componentRoot(snapshot.elements, hit)
      if (root?.component?.kind !== 'instance') return null
      const master = snapshot.elements[root.component.masterId]
      const machine = getEffectiveStateMachine(master)
      if (!machine) return null
      return { root: root as InstanceElement, master, machine }
    }

    const handlePointerMove = (event: PointerEvent) => {
      const instance = findInstance(event)
      const currentHoveredId = hoveredInstanceId.current

      if (!instance) {
        if (currentHoveredId) {
          // Exiting previous instance
          const prevInstance = store.getSnapshot().elements[currentHoveredId]
          if (prevInstance && prevInstance.component?.kind === 'instance') {
            const master = store.getSnapshot().elements[prevInstance.component.masterId]
            const machine = getEffectiveStateMachine(master)
            if (machine) {
              const baseState = originalStates.current.get(currentHoveredId) ?? machine.initial
              const exitTransition = machine.transitions.find(t => t.fromState === 'hover' && t.targetState === baseState)
              if (exitTransition) applySpringStyle(currentHoveredId, exitTransition)
              store.setComponentActiveState(currentHoveredId, baseState, false)
            }
          }
          hoveredInstanceId.current = null
          setHoveredBadge(null)
        }
        return
      }

      const { root, master, machine } = instance
      if (currentHoveredId !== root.id) {
        // Exiting old instance if any
        if (currentHoveredId && currentHoveredId !== root.id) {
          const prevInstance = store.getSnapshot().elements[currentHoveredId]
          if (prevInstance && prevInstance.component?.kind === 'instance') {
            const prevMaster = store.getSnapshot().elements[prevInstance.component.masterId]
            const prevMachine = getEffectiveStateMachine(prevMaster)
            if (prevMachine) {
              const base = originalStates.current.get(currentHoveredId) ?? prevMachine.initial
              store.setComponentActiveState(currentHoveredId, base, false)
            }
          }
        }

        hoveredInstanceId.current = root.id
        if (!originalStates.current.has(root.id)) {
          originalStates.current.set(root.id, root.component.activeState ?? null)
        }

        const currentState = root.component.activeState ?? machine.initial
        const next = resolveNextState(machine, currentState, 'on-hover')
        if (next) {
          applySpringStyle(root.id, next.transition)
          store.setComponentActiveState(root.id, next.targetState, false)
          setHoveredBadge({ id: root.id, name: master.name, state: next.targetState })
        } else {
          setHoveredBadge({ id: root.id, name: master.name, state: currentState })
        }
      }
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      const instance = findInstance(event)
      if (!instance) return
      const { root, master, machine } = instance
      pressedInstanceId.current = root.id
      const currentState = root.component.activeState ?? machine.initial
      const next = resolveNextState(machine, currentState, 'while-pressed')
      if (next) {
        applySpringStyle(root.id, next.transition)
        store.setComponentActiveState(root.id, next.targetState, false)
        setHoveredBadge({ id: root.id, name: master.name, state: next.targetState })
      }
    }

    const handlePointerUp = (event: PointerEvent) => {
      const pressedId = pressedInstanceId.current
      pressedInstanceId.current = null
      const instance = findInstance(event)
      if (!instance || (pressedId && instance.root.id !== pressedId)) {
        if (pressedId) {
          const pressedEl = store.getSnapshot().elements[pressedId]
          if (pressedEl && pressedEl.component?.kind === 'instance') {
            const master = store.getSnapshot().elements[pressedEl.component.masterId]
            const machine = getEffectiveStateMachine(master)
            if (machine) {
              const base = originalStates.current.get(pressedId) ?? machine.initial
              store.setComponentActiveState(pressedId, base, false)
            }
          }
        }
        return
      }

      const { root, master, machine } = instance
      const currentState = root.component.activeState ?? machine.initial

      // Check on-click transition
      const nextClick = resolveNextState(machine, currentState, 'on-click')
      if (nextClick) {
        applySpringStyle(root.id, nextClick.transition)
        store.setComponentActiveState(root.id, nextClick.targetState, false)
        setHoveredBadge({ id: root.id, name: master.name, state: nextClick.targetState })
      } else if (currentState === 'pressed') {
        // Return to hover or initial
        const returnState = machine.states.includes('hover') ? 'hover' : machine.initial
        const returnTransition = machine.transitions.find(t => t.fromState === 'pressed' && t.targetState === returnState)
        if (returnTransition) applySpringStyle(root.id, returnTransition)
        store.setComponentActiveState(root.id, returnState, false)
        setHoveredBadge({ id: root.id, name: master.name, state: returnState })
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onExit?.()
      }
    }

    overlay.addEventListener('pointermove', handlePointerMove)
    overlay.addEventListener('pointerdown', handlePointerDown)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      overlay.removeEventListener('pointermove', handlePointerMove)
      overlay.removeEventListener('pointerdown', handlePointerDown)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('keydown', handleKeyDown)

      // Restore instances to original states
      for (const [id, original] of originalStates.current) {
        store.setComponentActiveState(id, original, false)
      }
      for (const timeout of activeTransitions.current.values()) {
        window.clearTimeout(timeout)
      }
    }
  }, [store, controller, onExit])

  return (
    <div
      ref={overlayRef}
      className="interactive-canvas-overlay"
      data-testid="interactive-canvas-overlay"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'auto',
        cursor: 'pointer',
        zIndex: 50,
      }}
    >
      {hoveredBadge && (
        <div className="interactive-instance-pill" data-testid="interactive-instance-pill">
          <span className="pill-dot" />
          <span className="pill-name">{hoveredBadge.name}</span>
          <span className="pill-arrow">/</span>
          <span className="pill-state">{hoveredBadge.state}</span>
        </div>
      )}
    </div>
  )
}
