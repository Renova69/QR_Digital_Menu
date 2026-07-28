import React, { useState } from "react";
import { useMenuContext } from "../../context/MenuContext";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Modal } from "../ui/modal";
import { useTranslation } from "react-i18next";

export const CreateCategoryForm: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [isDrinkCategory, setIsDrinkCategory] = useState(false);
  const { createCategory } = useMenuContext();
  const { t } = useTranslation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await createCategory({ name, isDrinkCategory });
    setName("");
    setIsDrinkCategory(false);
    setOpen(false);
  };

  return (
    <Modal
      dashboardUi
      open={open}
      onOpenChange={setOpen}
      title={t("menuAdmin.addCategory", "Create Category")}
      description={t(
        "menuAdmin.addCategoryDesc",
        "Add a new category to your menu.",
      )}
      trigger={<Button>{t("menuAdmin.addCategory", "Add Category")}</Button>}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("menuAdmin.categoryNamePlaceholder", "Category name")}
          required
        />
        <div className="flex items-center space-x-2 pt-2 pb-4">
          <input
            type="checkbox"
            id="isDrinkCategory"
            checked={isDrinkCategory}
            onChange={(e) => setIsDrinkCategory(e.target.checked)}
            className="w-4 h-4 rounded border-border text-primary focus:ring-primary"
          />
          <label
            htmlFor="isDrinkCategory"
            className="text-[12px] font-bold text-foreground"
          >
            {t("auto.thisIsABeverageCategory", "This is a Beverage Category")}
          </label>
        </div>
        <Button type="submit">{t("forms.create", "Create")}</Button>
      </form>
    </Modal>
  );
};
