import React, { useState } from "react";
import { useMenuContext } from "../../context/MenuContext";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { ImageUploadInput } from "../ui/ImageUploadInput";
import { Modal } from "../ui/modal";
import { useToast } from "../ui/toast";
import { useTranslation } from "react-i18next";
import { getApiError } from "../../lib/apiError";
import { UpsellContextSelector } from "./UpsellContextSelector";
import { UpsellContext } from "../../lib/upsellContexts";
import { RewardPricingFields } from "./RewardPricingFields";
import type { RewardPointsMode } from "../../types";

export const CreateItemForm: React.FC = () => {
  const [open, setOpen] = useState(false);
  const { createItem, selectedCategory, categories } = useMenuContext();

  const allItems = categories ? categories.flatMap((c) => c.items || []) : [];
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [allergens, setAllergens] = useState("");
  const [dietaryTags, setDietaryTags] = useState("");
  const [isFeatured, setIsFeatured] = useState(false);
  const [upsellContexts, setUpsellContexts] = useState<UpsellContext[]>([]);
  const [rewardPointsMode, setRewardPointsMode] =
    useState<RewardPointsMode>("OFF");
  const [rewardPointsPrice, setRewardPointsPrice] = useState("");
  const [relatedItemIds, setRelatedItemIds] = useState<string[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { t } = useTranslation();
  const { showToast, ToastComponent } = useToast();

  const resetForm = () => {
    setName("");
    setDescription("");
    setPrice("");
    setCostPrice("");
    setAllergens("");
    setDietaryTags("");
    setIsFeatured(false);
    setUpsellContexts([]);
    setRewardPointsMode("OFF");
    setRewardPointsPrice("");
    setRelatedItemIds([]);
    setImageFile(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategory) return;

    setIsSubmitting(true);
    try {
      await createItem({
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
        upsellContexts,
        costPrice: costPrice ? parseFloat(costPrice) : undefined,
        rewardPointsMode,
        rewardPointsPrice:
          rewardPointsMode === "CUSTOM" && rewardPointsPrice
          ? parseInt(rewardPointsPrice)
          : undefined,
        relatedItemIds,
        imageFile,
      });
      showToast("Item created successfully", "success");
      resetForm();
      setOpen(false);
    } catch (error: any) {
      showToast(t(getApiError(error)), "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      {ToastComponent}
      <Modal
        open={open}
        onOpenChange={(open) => {
          setOpen(open);
          if (!open) resetForm();
        }}
        title={t("menuAdmin.addItem", "Create Item")}
        description={`Add a new item to the "${selectedCategory?.name}" category.`}
        trigger={
          <Button disabled={!selectedCategory}>
            {t("menuAdmin.addItem", "Add Item")}
          </Button>
        }
      >
        <form
          onSubmit={handleSubmit}
          className="space-y-4 max-h-[80vh] overflow-y-auto pr-2"
        >
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t("forms.itemName", "Item Name")} *
            </label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("auto.eGGreekSalad", "e.g. Greek Salad")}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t("forms.description", "Description")}
            </label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t(
                "auto.freshIngredientsOlivesFeta",
                "Fresh ingredients, olives, feta...",
              )}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t("forms.price", "Price")} (€) *
            </label>
            <Input
              type="number"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              required
              step="0.01"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t("forms.costPrice", "Item Cost")} (€)
            </label>
            <Input
              type="number"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.01"
            />
            <p className="text-xs text-muted-foreground">
              {t(
                "forms.costPriceHint",
                "What this item costs you to make. Used for profit analytics.",
              )}
            </p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t("forms.allergens", "Allergens")}{" "}
              {t("auto.CommaSeparated", "(comma separated)")}
            </label>
            <Input
              type="text"
              value={allergens}
              onChange={(e) => setAllergens(e.target.value)}
              placeholder={t(
                "auto.eGNutsDairyGluten",
                "e.g. Nuts, Dairy, Gluten",
              )}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t("forms.dietaryTags", "Dietary Tags")}{" "}
              {t("auto.CommaSeparated", "(comma separated)")}
            </label>
            <Input
              type="text"
              value={dietaryTags}
              onChange={(e) => setDietaryTags(e.target.value)}
              placeholder={t(
                "auto.eGVeganVegetarianSpicy",
                "e.g. Vegan, Vegetarian, Spicy",
              )}
            />
          </div>

          <div className="flex items-center space-x-2 pt-2 border-t mt-4 border-border/50">
            <input
              type="checkbox"
              id={`isFeatured-new`}
              checked={isFeatured}
              onChange={(e) => setIsFeatured(e.target.checked)}
              className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
            />
            <label
              htmlFor={`isFeatured-new`}
              className="text-sm font-bold text-foreground"
            >
              {t(
                "auto.FeatureItemTrendingNow",
                "⭐ Feature Item (Trending Now)",
              )}
            </label>
          </div>

          <UpsellContextSelector
            value={upsellContexts}
            onChange={setUpsellContexts}
          />

          <RewardPricingFields
            fieldId="new-item"
            mode={rewardPointsMode}
            onModeChange={setRewardPointsMode}
            customPoints={rewardPointsPrice}
            onCustomPointsChange={setRewardPointsPrice}
            itemPrice={price}
          />

          <div className="space-y-2 pb-4">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              {t("auto.perfectPairings", "Perfect Pairings")}
            </label>
            <div className="flex flex-col gap-1 max-h-32 overflow-y-auto p-2 border border-border/50 rounded bg-secondary/20">
              {allItems.length > 0 ? (
                (allItems as any[]).map((otherItem: any) => (
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
                      className="w-3.5 h-3.5 rounded border-border/70 text-primary focus:ring-primary focus:ring-1"
                    />
                    <span className="text-xs text-foreground group-hover:text-primary font-medium">
                      {otherItem.name}
                    </span>
                  </label>
                ))
              ) : (
                <span className="text-xs text-muted-foreground px-1">
                  {t("auto.noOtherItemsAvailable", "No other items available.")}
                </span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {t(
                "auto.selectItemsThatGoWellWith",
                "Select items that go well with this.",
              )}
            </p>
          </div>

          <ImageUploadInput
            currentImageUrl={null}
            onFileSelect={setImageFile}
            label={t("forms.itemImage", "Item Image")}
            aspectRatio="wide"
          />

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? "Creating..." : t("forms.create", "Create Item")}
          </Button>
        </form>
      </Modal>
    </>
  );
};
