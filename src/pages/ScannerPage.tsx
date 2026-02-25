import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BrowserMultiFormatReader } from '@zxing/browser'

function ScannerPage() {
  const navigate = useNavigate()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)

  useEffect(() => {
    const codeReader = new BrowserMultiFormatReader()
    let isMounted = true
    let controls: any

    async function startScanner() {
      setCameraError(null)

      try {
        controls = await codeReader.decodeFromVideoDevice(
          undefined,
          videoRef.current ?? undefined,
          (result, error) => {
            if (result) {
              const text = result.getText()

              // Expect values like CYCLE_1, CYCLE_2, CYCLE_3
              if (text.startsWith('CYCLE_')) {
                const id = text.split('_')[1]
                navigate(`/cycle/${id}`, {
                  replace: true,
                  state: { cycleName: `Cycle ${id}` },
                })
              }
            }

            if (error) {
              // ignore continuous decode errors; they happen while scanning
            }
          },
        )
      } catch (err: any) {
        if (!isMounted) return
        if (err?.name === 'NotAllowedError') {
          setCameraError('Camera access was denied. Allow camera to scan QR codes.')
        } else {
          setCameraError('Unable to start camera on this device.')
        }
      }
    }

    startScanner()

    return () => {
      isMounted = false
      if (controls && typeof controls.stop === 'function') {
        controls.stop()
      }
    }
  }, [navigate])

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-white">
      <header className="px-6 pt-8 pb-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-neutral/70 uppercase tracking-[0.25em]">
            Scan cycle
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            QR Scanner
          </h1>
          <p className="mt-1 text-xs text-neutral/60">
            Point your camera at the QR code on the cycle to begin.
          </p>
        </div>
        <button
          className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs"
          onClick={() => navigate('/home')}
        >
          Close
        </button>
      </header>

      <main className="flex-1 px-6 pb-6 flex flex-col gap-4">
        <div className="relative flex-1 rounded-3xl border border-dashed border-white/20 bg-black/40 overflow-hidden flex items-center justify-center">
          <div className="absolute inset-6 rounded-3xl border-2 border-accent/80" />
          <video
            ref={videoRef}
            className="relative z-10 h-full w-full object-cover"
            playsInline
            muted
          />
          {!cameraError && (
            <p className="absolute bottom-4 left-4 right-4 text-[11px] text-neutral/60 text-center">
              Align the QR code inside the frame to detect the cycle.
            </p>
          )}
          {cameraError && (
            <p className="absolute bottom-4 left-4 right-4 text-[11px] text-amber-200 text-center px-4">
              {cameraError}
            </p>
          )}
        </div>

        <div className="space-y-3 text-xs text-neutral/60">
          <p className="font-medium text-neutral/50 uppercase tracking-[0.18em]">
            Or pick a demo cycle
          </p>
          <div className="grid grid-cols-3 gap-3">
            {['Cycle 1', 'Cycle 2', 'Cycle 3'].map((label, index) => (
              <button
                key={label}
                className="rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-left hover:border-accent/70 active:scale-[0.98]"
                onClick={() =>
                  navigate(`/cycle/${index + 1}`, {
                    state: { cycleName: label },
                  })
                }
              >
                <p className="text-[11px] text-neutral/70">Demo</p>
                <p className="mt-1 text-sm font-semibold">{label}</p>
                <p className="mt-1 text-[11px] text-neutral/60">
                  Tap to simulate a successful scan.
                </p>
              </button>
            ))}
          </div>

          <button
            type="button"
            className="mt-2 inline-flex items-center gap-2 text-[11px] text-neutral/60 underline underline-offset-2"
          >
            Enter cycle ID manually (coming soon)
          </button>
        </div>
      </main>
    </div>
  )
}

export default ScannerPage

