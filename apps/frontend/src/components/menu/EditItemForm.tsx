import React, { useState } from "react";
import { useMenuContext } from "../../context/MenuContext";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Modal } from "../ui/modal";
import { Item } from "../../types";

interface EditItemFormProps {
  item: Item;
  trigger?: React.ReactNode;
}

export const EditItemForm: React.FC<EditItemFormProps> = ({
  item,
  trigger,
}) => {
  const [open, setOpen] = useState(false);
  const { updateItem, categories } = useMenuContext();

  const allItems = categories ? categories.flatMap((c) => c.items || []) : [];
  const otherItems = allItems.filter((i) => i.id !== item.id);
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description || "");
  const [price, setPrice] = useState(item.price.toString());
  const [allergens, setAllergens] = useState(item.allergens?.join(", ") || "");
  const [dietaryTags, setDietaryTags] = useState(
    item.dietaryTags?.join(", ") || "",
  );
  const [isFeatured, setIsFeatured] = useState(item.isFeatured || false);
  const [rewardPointsPrice, setRewardPointsPrice] = useState(
    item.rewardPointsPrice?.toString() || "",
  );
  const [relatedItemIds, setRelatedItemIds] = useState<string[]>(
    item.relatedItemIds || [],
  );
  const [imageFile, setImageFile] = useState<File | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateItem(item.id, {
        name,
        description,
        price: parseFloat(price),
        currency: "EUR",
        allergens: allergens
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s !== ""),
        dietaryTags: dietaryTags
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s !== ""),
        isFeatured,
        rewardPointsPrice: rewardPointsPrice
          ? parseInt(rewardPointsPrice)
          : undefined,
        relatedItemIds,
        imageFile,
      });
    } catch (error) {
      console.error("Failed to update item:", error);
    } finally {
      setOpen(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="Edit Item"
      description={`Update the details for "${item.name}".`}
      trigger={
        trigger || (
          <Button variant="outline" size="sm">
            Edit
          </Button>
        )
      }
    >
      <form
        onSubmit={handleSubmit}
        className="space-y-4 max-h-[80vh] overflow-y-auto pr-2"
      >
        <div className="space-y-2">
          <label className="text-sm font-medium">Item Name *</label>
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Greek Salad"
            required
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Description</label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Item description"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Price (€) *</label>
          <Input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
            required
            step="0.01"
          />
        </div>

        <div className="flex items-center space-x-2 pt-2 border-t mt-4 border-border/50">
          <input
            type="checkbox"
            id={`isFeatured-${item.id}`}
            checked={isFeatured}
            onChange={(e) => setIsFeatured(e.target.checked)}
            className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
          />
          <label
            htmlFor={`isFeatured-${item.id}`}
            className="text-sm font-bold text-foreground"
          >
            ⭐ Feature Item (Trending Now)
          </label>
        </div>

        <div className="space-y-2 border-b border-border/50 pb-4">
          <label className="text-sm font-medium block">
            Loyalty Points Cost (Freebie)
          </label>
          <Input
            type="number"
            value={rewardPointsPrice}
            onChange={(e) => setRewardPointsPrice(e.target.value)}
            placeholder="e.g. 100"
          />
          <p className="text-xs text-muted-foreground">
            Leave blank if this item cannot be redeemed for points.
          </p>
        </div>

        <div className="space-y-2 pb-4">
          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            Perfect Pairings
          </label>
          <div className="flex flex-col gap-1 max-h-32 overflow-y-auto p-2 border border-border/50 rounded bg-secondary/20">
            {otherItems.length > 0 ? (
              otherItems.map((otherItem) => (
                <label
                  key={otherItem.id}
                  className="flex items-center gap-2 cursor-pointer hover:bg-secondary/50 p-1 rounded transition-colors group"
                >
                  <input
                    type="checkbox"
                    checked={relatedItemIds.includes(otherItem.id)}
                    onChange={(e) => {
                      if (e.target.checked)
                        setRelatedItemIds([...relatedItemIds, otherItem.id]);
                      else
                        setRelatedItemIds(
                          relatedItemIds.filter((id) => id !== otherItem.id),
                        );
                    }}
                    className="w-3.5 h-3.5 rounded border-border/70 text-accent focus:ring-accent focus:ring-1"
                  />
                  <span className="text-xs text-foreground group-hover:text-accent font-medium">
                    {otherItem.name}
                  </span>
                </label>
              ))
            ) : (
              <span className="text-xs text-muted-foreground px-1">
                No other items available.
              </span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Select items that go well with this.
          </p>
        </div>

        <div className="space-y-2 border-t border-border/50 pt-4">
          <label className="text-sm font-medium">
            Allergens (comma separated)
          </label>
          <Input
            type="text"
            value={allergens}
            onChange={(e) => setAllergens(e.target.value)}
            placeholder="e.g. Nuts, Dairy"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">
            Dietary Tags (comma separated)
          </label>
          <Input
            type="text"
            value={dietaryTags}
            onChange={(e) => setDietaryTags(e.target.value)}
            placeholder="e.g. Vegan, Spicy"
          />
        </div>

        <div className="space-y-2 border-t pt-2">
          <label className="text-sm font-medium block">
            Update Image (optional)
          </label>
          {item.imageUrl && (
            <div className="mb-2 p-2 border border-border rounded bg-secondary/50 flex justify-center">
              <img
                src={
                  item.imageUrl.startsWith("http")
                    ? item.imageUrl
                    : `${((import.meta as any).env.VITE_API_URL || "http://localhost:3000/api").replace("/api", "")}/${item.imageUrl}`
                }
                alt="Current"
                className="h-20 object-contain"
              />
            </div>
          )}
          <Input
            type="file"
            accept="image/*"
            onChange={(e) =>
              setImageFile(e.target.files ? e.target.files[0] : null)
            }
          />
        </div>

        <Button type="submit" className="w-full">
          Save Changes
        </Button>
      </form>
    </Modal>
  );
};
