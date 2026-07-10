import React, { useContext } from "react";
import RestaurantContext from "../context/RestaurantContext";
import { useTranslation } from "react-i18next";

const RestaurantList: React.FC = () => {
  const { t } = useTranslation();
  const { restaurants, activeRestaurant, selectRestaurant, loading }: any =
    useContext(RestaurantContext);

  if (loading) {
    return <p>{t("auto.loadingRestaurants", "Loading restaurants...")}</p>;
  }

  return (
    <div>
      <h3>{t("auto.yourRestaurants", "Your Restaurants")}</h3>
      <ul>
        {restaurants.map((restaurant: any) => (
          <li
            key={restaurant.id}
            onClick={() => selectRestaurant(restaurant)}
            style={{
              cursor: "pointer",
              fontWeight:
                activeRestaurant?.id === restaurant.id ? "bold" : "normal",
            }}
          >
            {restaurant.name} ({restaurant.country})
          </li>
        ))}
      </ul>
    </div>
  );
};

export default RestaurantList;
