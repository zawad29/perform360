import { Logo } from "@/components/ui/logo";
import Link from "next/link";
import { Mail, ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function VerifyPage() {
  return (
    <div className="space-y-8">
      {/* Mobile-only logo */}
      <div className="flex items-center lg:hidden">
        <Logo />
      </div>

      <div>
        <h1 className="text-[11px] font-medium tracking-widest uppercase text-gray-900">Check your email</h1>
        <p className="text-body text-gray-500 mt-2">
          We sent you a secure sign-in link
        </p>
      </div>

      <Card padding="lg">
        <div className="flex flex-col items-start space-y-5">
          {/* Mail icon */}
          <div className="w-16 h-16 border border-gray-900 flex items-center justify-center">
            <Mail
              size={28}
              strokeWidth={1.5}
              className="text-gray-900"
            />
          </div>

          <div className="space-y-2">
            <p className="text-body text-gray-700">
              Click the link in your email to sign in.
            </p>
            <p className="text-callout text-gray-400">
              The link expires in 5 minutes. Check your spam folder if you
              don&apos;t see it.
            </p>
          </div>

          <div className="w-full pt-2">
            <Button variant="secondary" className="w-full gap-2" asChild>
              <Link href="/login">
                <ArrowLeft size={16} strokeWidth={1.5} />
                Back to sign in
              </Link>
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
