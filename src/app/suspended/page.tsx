import { Logo } from "@/components/logo";
import { signOut } from "@/app/auth/actions";

export default function SuspendedPage() {
  return (
    <div className="grid min-h-screen flex-1 place-items-center bg-paper px-4">
      <div className="max-w-md text-center">
        <div className="flex justify-center">
          <Logo />
        </div>
        <h1 className="mt-8 text-2xl font-semibold">This workspace is paused</h1>
        <p className="mt-2 text-muted">Access has been suspended by the StockSetu team. Your data is safe. Please contact us to reactivate.</p>
        <form action={signOut} className="mt-6">
          <button className="rounded-full bg-ink px-5 py-2.5 text-sm font-medium text-white">Log out</button>
        </form>
      </div>
    </div>
  );
}
