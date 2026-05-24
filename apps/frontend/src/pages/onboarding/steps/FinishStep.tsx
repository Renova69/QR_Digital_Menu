import { Rocket } from 'lucide-react';

interface Props {
  restaurantName: string;
  onDone: () => void;
}

export default function FinishStep({ restaurantName, onDone }: Props) {

  return (
    <div className="flex flex-col items-center gap-6 py-12 text-center max-w-md mx-auto">
      <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
        <Rocket className="w-10 h-10 text-primary" />
      </div>
      <div className="space-y-2">
        <h2 className="text-3xl font-display font-bold text-foreground">You're all set!</h2>
        <p className="text-muted-foreground">
          <span className="font-semibold text-foreground">{restaurantName}</span> is ready. Start building your menu, adding staff, and taking orders.
        </p>
      </div>
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>Next steps you can do in your dashboard:</p>
        <ul className="space-y-1 text-left list-none">
          {[
            'Add menu categories and items',
            'Print or share your QR codes',
            'Invite staff members',
            'Customise branding and colours',
          ].map((tip) => (
            <li key={tip} className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
              {tip}
            </li>
          ))}
        </ul>
      </div>
      <button
        onClick={onDone}
        className="mt-4 px-8 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all shadow-lg hover:shadow-primary/30"
      >
        Go to Dashboard
      </button>
    </div>
  );
}
