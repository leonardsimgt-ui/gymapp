'use client'

import { createContext, useContext } from 'react'

export type ViewMode = 'manager' | 'trainer'

interface ViewModeContextValue {
  viewMode: ViewMode
  // True if this user is a manager-trainer AND is currently in trainer view
  isActingAsTrainer: boolean
}

export const ViewModeContext = createContext<ViewModeContextValue>({
  viewMode: 'manager',
  isActingAsTrainer: false,
})

export const useViewMode = () => useContext(ViewModeContext)
