import { DEFAULT_SPRING, validateSpring } from '../prototype/spring.ts'
import type {
  ComponentStateMachine,
  ComponentStateTransition,
  ComponentStateTrigger,
  InteractiveStateType,
  SceneElement,
} from './types.ts'

export const DEFAULT_INTERACTIVE_STATES: readonly InteractiveStateType[] = Object.freeze([
  'default',
  'hover',
  'pressed',
  'active',
])

export const DEFAULT_STATE_TRIGGERS: readonly ComponentStateTrigger[] = Object.freeze([
  'on-click',
  'on-hover',
  'while-pressed',
])

export const STATE_TRIGGER_LABELS: Readonly<Record<ComponentStateTrigger, string>> = Object.freeze({
  'on-click': 'On Click',
  'on-hover': 'On Hover',
  'while-pressed': 'While Pressed',
})

const safeId = (id: unknown): id is string =>
  typeof id === 'string' && !!id && id.length <= 200 && !['__proto__', 'constructor', 'prototype'].includes(id)

export function createDefaultStateMachine(
  states: readonly string[] = DEFAULT_INTERACTIVE_STATES
): ComponentStateMachine {
  const stateList = states.length > 0 ? states : DEFAULT_INTERACTIVE_STATES
  const initial = stateList[0] ?? 'default'
  const has = (name: string) => stateList.includes(name)

  const transitions: ComponentStateTransition[] = []
  if (has('default') && has('hover')) {
    transitions.push({
      id: crypto.randomUUID(),
      fromState: 'default',
      trigger: 'on-hover',
      targetState: 'hover',
      spring: Object.freeze({ stiffness: 220, damping: 24, mass: 1 }),
    })
  }
  if (has('hover') && has('pressed')) {
    transitions.push({
      id: crypto.randomUUID(),
      fromState: 'hover',
      trigger: 'while-pressed',
      targetState: 'pressed',
      spring: Object.freeze({ stiffness: 350, damping: 28, mass: 1 }),
    })
  }
  if (has('pressed') && has('active')) {
    transitions.push({
      id: crypto.randomUUID(),
      fromState: 'pressed',
      trigger: 'on-click',
      targetState: 'active',
      spring: Object.freeze({ stiffness: 200, damping: 18, mass: 1 }),
    })
  }
  if (has('active') && has('default')) {
    transitions.push({
      id: crypto.randomUUID(),
      fromState: 'active',
      trigger: 'on-click',
      targetState: 'default',
      spring: Object.freeze({ stiffness: 180, damping: 22, mass: 1 }),
    })
  } else if (has('pressed') && has('default') && !has('active')) {
    transitions.push({
      id: crypto.randomUUID(),
      fromState: 'pressed',
      trigger: 'on-click',
      targetState: 'default',
      spring: Object.freeze({ stiffness: 200, damping: 22, mass: 1 }),
    })
  }

  return Object.freeze({
    initial,
    states: Object.freeze([...stateList]),
    transitions: Object.freeze(transitions),
  })
}

export function validateStateMachine(
  value: unknown,
  allowedStates?: readonly string[]
): ComponentStateMachine {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid component state machine')
  }
  const machine = value as Partial<ComponentStateMachine>
  if (!Array.isArray(machine.states) || !machine.states.length || machine.states.length > 50) {
    throw new Error('Component state machine must define at least one state (up to 50)')
  }
  const stateSet = new Set<string>()
  for (const state of machine.states) {
    if (typeof state !== 'string' || !state.trim() || state.length > 100 || stateSet.has(state.trim())) {
      throw new Error(`Invalid or duplicate state name: ${state}`)
    }
    stateSet.add(state.trim())
  }
  if (allowedStates && allowedStates.length > 0) {
    const allowed = new Set(allowedStates)
    for (const state of stateSet) {
      if (!allowed.has(state)) {
        throw new Error(`State '${state}' must correspond to an existing variant option`)
      }
    }
  }
  if (typeof machine.initial !== 'string' || !stateSet.has(machine.initial)) {
    throw new Error(`Initial state '${machine.initial}' is not in states list`)
  }
  if (!Array.isArray(machine.transitions) || machine.transitions.length > 100) {
    throw new Error('Transitions must be an array of up to 100 items')
  }

  const transitionIds = new Set<string>()
  const validatedTransitions = machine.transitions.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new Error(`Invalid transition at index ${index}`)
    }
    const transition = item as Partial<ComponentStateTransition>
    const id = safeId(transition.id) ? transition.id : crypto.randomUUID()
    if (transitionIds.has(id)) {
      throw new Error(`Duplicate transition ID: ${id}`)
    }
    transitionIds.add(id)
    if (typeof transition.fromState !== 'string' || !stateSet.has(transition.fromState)) {
      throw new Error(`Transition fromState '${transition.fromState}' is unknown`)
    }
    if (!transition.trigger || !DEFAULT_STATE_TRIGGERS.includes(transition.trigger)) {
      throw new Error(`Invalid trigger '${transition.trigger}'`)
    }
    if (typeof transition.targetState !== 'string' || !stateSet.has(transition.targetState)) {
      throw new Error(`Transition targetState '${transition.targetState}' is unknown`)
    }
    const spring = validateSpring(transition.spring ?? DEFAULT_SPRING)

    return Object.freeze({
      id,
      fromState: transition.fromState,
      trigger: transition.trigger,
      targetState: transition.targetState,
      spring,
    })
  })

  return Object.freeze({
    initial: machine.initial,
    states: Object.freeze(Array.from(stateSet)),
    transitions: Object.freeze(validatedTransitions),
  })
}

export function findStateTransition(
  machine: ComponentStateMachine,
  fromState: string,
  trigger: ComponentStateTrigger
): ComponentStateTransition | undefined {
  return machine.transitions.find(t => t.fromState === fromState && t.trigger === trigger)
}

export function resolveNextState(
  machine: ComponentStateMachine,
  currentState: string,
  trigger: ComponentStateTrigger
): { targetState: string; transition: ComponentStateTransition } | null {
  const transition = findStateTransition(machine, currentState, trigger)
  if (!transition) return null
  return { targetState: transition.targetState, transition }
}

export function getEffectiveStateMachine(master: SceneElement | undefined): ComponentStateMachine | undefined {
  if (!master || master.component?.kind !== 'master') return undefined
  if (master.component.stateMachine) return master.component.stateMachine
  const variantProp = master.component.properties?.find(p => p.kind === 'variant' && p.stateMachine)
  if (variantProp && variantProp.kind === 'variant' && variantProp.stateMachine) {
    return variantProp.stateMachine
  }
  return undefined
}
