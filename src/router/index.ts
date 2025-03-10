import { createRouter, createWebHistory } from "vue-router";
import { RouterView } from "vue-router";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/",
      redirect: "/home",
    },
    {
      path: "/home",
      name: "home",
      component: () => import("@/pages/home/index.vue"),
    },
  ],
});

export default router;
