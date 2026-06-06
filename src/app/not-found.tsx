import { Logo } from "@/components/ui/logo";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Navbar */}
      <div className="border-b border-gray-900 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto h-16 flex items-center">
          <Link href="/">
            <Logo />
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center px-4 sm:px-6">
        <div className="max-w-6xl mx-auto w-full py-20">
          <p className="text-[14px] uppercase tracking-caps text-accent">
            404
          </p>
          <h1 className="font-serif text-[40px] sm:text-[56px] font-bold text-gray-900 leading-[1.08] tracking-tight mt-4">
            Page not
            <br />
            found.
          </h1>
          <div className="w-16 h-[2px] bg-accent mt-8" />
          <p className="text-[17px] text-gray-500 max-w-md mt-6 leading-relaxed">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
          <div className="flex items-start gap-4 mt-10">
            <Button asChild className="bg-accent text-white hover:bg-accent/90">
              <Link href="/">Go Home</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
