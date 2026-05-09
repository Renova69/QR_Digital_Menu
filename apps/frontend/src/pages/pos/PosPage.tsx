import { usePos } from "../../context/PosContext";
import PosTopBar from "../../components/pos/PosTopBar";
import PosCategoryFilter from "../../components/pos/PosCategoryFilter";
import PosItemGrid from "../../components/pos/PosItemGrid";
import PosTableModal from "../../components/pos/PosTableModal";
import PosOptionsDrawer from "../../components/pos/PosOptionsDrawer";
import PosSeatSelector from "../../components/pos/PosSeatSelector";
import PosCartDrawer from "../../components/pos/PosCartDrawer";

export default function PosPage() {
  const { session, items, getTotal } = usePos();

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
  const total = getTotal();

  return (
    <>
      {/* Sticky top — hidden until table selected */}
      {session && (
        <div className="sticky top-0 z-10 bg-background pt-safe">
          <PosTopBar />
          <PosCategoryFilter />
        </div>
      )}

      {/* Scrollable content */}
      {session ? (
        <div className="flex-1 overflow-y-auto">
          <PosItemGrid />
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* Fixed bottom bar — hidden until table selected */}
      {session && (
        <div className="sticky bottom-0 z-10 bg-background border-t border-border pb-safe">
          <PosSeatSelector />
          <PosCartDrawer itemCount={itemCount} total={total} />
        </div>
      )}

      {/* Modals — always mounted */}
      <PosTableModal />
      <PosOptionsDrawer />
    </>
  );
}
