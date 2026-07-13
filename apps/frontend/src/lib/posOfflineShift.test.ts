import { beforeEach, describe, expect, it } from "vitest";
import {
  clearOfflineShift,
  loadOfflineRestaurant,
  loadOfflineStaff,
  saveOfflineRestaurant,
  saveOfflineStaff,
} from "./posOfflineShift";

describe("POS offline shift grant", () => {
  beforeEach(() => sessionStorage.clear());

  it("restores POS staff and their restaurant within the current shift", () => {
    const staff = {
      id: "waiter-1",
      email: "waiter@example.com",
      role: "WAITER",
      restaurantId: "restaurant-1",
    };
    const restaurant = {
      id: "restaurant-1",
      name: "Bistro",
      country: "BG",
      ownerId: "owner-1",
    };

    saveOfflineStaff(staff);
    saveOfflineRestaurant(restaurant, staff.id);

    expect(loadOfflineStaff()).toEqual(staff);
    expect(loadOfflineRestaurant(staff.id, "restaurant-1")).toEqual(restaurant);
  });

  it("does not grant offline access to customer accounts", () => {
    saveOfflineStaff({
      id: "customer-1",
      email: "customer@example.com",
      role: "CUSTOMER",
    });

    expect(loadOfflineStaff()).toBeNull();
  });

  it("clears every offline shift snapshot on logout", () => {
    saveOfflineStaff({
      id: "waiter-1",
      email: "waiter@example.com",
      role: "WAITER",
      restaurantId: "restaurant-1",
    });
    saveOfflineRestaurant(
      {
        id: "restaurant-1",
        name: "Bistro",
        country: "BG",
        ownerId: "owner-1",
      },
      "waiter-1",
    );

    clearOfflineShift();

    expect(loadOfflineStaff()).toBeNull();
    expect(loadOfflineRestaurant("waiter-1", "restaurant-1")).toBeNull();
  });

  it("does not expose a previous staff member's restaurant", () => {
    saveOfflineStaff({
      id: "waiter-1",
      email: "first@example.com",
      role: "WAITER",
      restaurantId: "restaurant-1",
    });
    saveOfflineRestaurant(
      {
        id: "restaurant-1",
        name: "Bistro",
        country: "BG",
        ownerId: "owner-1",
      },
      "waiter-1",
    );

    saveOfflineStaff({
      id: "owner-2",
      email: "second@example.com",
      role: "OWNER",
    });

    expect(loadOfflineRestaurant("owner-2")).toBeNull();
  });
});
