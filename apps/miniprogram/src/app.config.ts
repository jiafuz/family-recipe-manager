export default defineAppConfig({
  pages: [
    "pages/ordering/index",
    "pages/meal-records/index",
    "pages/discovery/index",
    "pages/profile/index",
    "pages/recipes/manage/index",
    "pages/recipes/editor/index",
    "pages/ordering/checkout/index",
    "pages/procurement/index",
    "pages/meal-share/index",
    "pages/meal-photo-editor/index",
    "pages/kitchens/switch/index",
    "pages/kitchens/create/index",
    "pages/kitchens/join/index",
    "pages/kitchens/manage/index",
    "pages/kitchens/invite/index",
  ],
  window: {
    navigationStyle: "custom",
    backgroundTextStyle: "dark",
    backgroundColor: "#f8f3ec",
  },
  tabBar: {
    color: "#8d857c",
    selectedColor: "#d54836",
    backgroundColor: "#fffdf9",
    borderStyle: "white",
    list: [
      {
        pagePath: "pages/ordering/index",
        text: "点菜",
      },
      {
        pagePath: "pages/meal-records/index",
        text: "点餐记录",
      },
      {
        pagePath: "pages/discovery/index",
        text: "发现",
      },
      {
        pagePath: "pages/profile/index",
        text: "我的",
      },
    ],
  },
});
