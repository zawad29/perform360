import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";

interface DatabaseUnavailableProps {
  /** Optional reset handler — wires the "Try again" button when rendered from a client error boundary. */
  onReset?: () => void;
}

export function DatabaseUnavailable({ onReset }: DatabaseUnavailableProps) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="border-b border-gray-900 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto h-16 flex items-center">
          <Logo />
        </div>
      </div>

      <div className="flex-1 flex items-center px-4 sm:px-6">
        <div className="max-w-6xl mx-auto w-full py-20">
          <p className="text-[14px] uppercase tracking-caps text-accent">
            Service unavailable
          </p>
          <h1 className="font-serif text-[40px] sm:text-[56px] font-bold text-gray-900 leading-[1.08] tracking-tight mt-4">
            Something
            <br />
            went wrong.
          </h1>
          <div className="w-16 h-[2px] bg-accent mt-8" />
          <p className="text-[17px] text-gray-500 max-w-md mt-6 leading-relaxed">
            We&apos;re having trouble loading this page right now. Please try
            again in a moment.
          </p>

          {onReset && (
            <div className="flex items-start gap-4 mt-10">
              <Button onClick={onReset} className="bg-accent text-white hover:bg-accent/90">
                Try again
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
