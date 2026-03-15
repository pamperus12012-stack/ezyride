import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'

// You can adjust this type to match your real activeRental object
type ActiveRental = {
  cycleName: string
} | null

export function useActiveRentalLocation(activeRental: ActiveRental) {
  const watchIdRef = useRef<number | null>(null)
  const lastSentAtRef = useRef<number>(0)

  useEffect(() => {
    if (!activeRental) {
      // No active ride → stop tracking
      if (watchIdRef.current !== null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      return
    }

    if (!('geolocation' in navigator)) {
      console.log('Geolocation not supported on this device')
      return
    }

    const id = navigator.geolocation.watchPosition(
      async (pos) => {
        // Don't spam the database: send at most once every 15 seconds.
        const now = Date.now()
        if (now - lastSentAtRef.current < 15_000) return
        lastSentAtRef.current = now

        const { latitude, longitude } = pos.coords

        const { error } = await supabase
          .from('cycle_locations')
          .upsert({
            cycle_name: activeRental.cycleName,
            last_latitude: latitude,
            last_longitude: longitude,
            last_location_at: new Date().toISOString(),
          })

        if (error) {
          console.log('Failed to update cycle location:', error.message)
        }
      },
      (err) => {
        console.log('Location error:', err.message)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 15000, // reuse last 15s position
        timeout: 15000,
      },
    )

    watchIdRef.current = id

    // Cleanup if component unmounts or activeRental changes
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [activeRental])
}