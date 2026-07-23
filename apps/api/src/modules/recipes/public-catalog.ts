import type {
  PublicRecipeDetail,
  RecipeCategory,
  RecipeIngredientInput,
} from "@jiayan/contracts";

interface PublicRecipeSeedInput {
  id: string;
  name: string;
  description: string;
  category: RecipeCategory;
  coverEmoji: string;
  cookMinutes: number;
  tips: string;
  ingredients: RecipeIngredientInput[];
  steps: string[];
}

const updatedAt = "2026-07-01T00:00:00.000Z";

function createPublicRecipe(input: PublicRecipeSeedInput): PublicRecipeDetail {
  const currentVersionId = `${input.id}_v1`;
  return {
    id: input.id,
    currentVersionId,
    version: 1,
    name: input.name,
    description: input.description,
    category: input.category,
    coverEmoji: input.coverEmoji,
    cookMinutes: input.cookMinutes,
    ingredientCount: input.ingredients.length,
    updatedAt,
    authorName: "家宴菜谱编辑部",
    tips: input.tips,
    ingredients: input.ingredients.map((ingredient, index) => ({
      id: `${input.id}_i${index + 1}`,
      ...ingredient,
      sortOrder: index,
    })),
    steps: input.steps.map((instruction, index) => ({
      id: `${input.id}_s${index + 1}`,
      instruction,
      stepNumber: index + 1,
    })),
  };
}

export const publicRecipeCatalog: PublicRecipeDetail[] = [
  createPublicRecipe({
    id: "public_recipe_01",
    name: "番茄炒蛋",
    description: "酸甜下饭、十几分钟就能完成的家庭快手菜。",
    category: "egg",
    coverEmoji: "🍳",
    cookMinutes: 15,
    tips: "番茄炒出汤汁后再回锅鸡蛋，口感更嫩。",
    ingredients: [
      { name: "番茄", quantity: 2, unit: "个", category: "vegetable" },
      { name: "鸡蛋", quantity: 3, unit: "个", category: "egg" },
      { name: "食用油", quantity: 15, unit: "毫升", category: "seasoning" },
    ],
    steps: [
      "番茄切块，鸡蛋打散。",
      "鸡蛋炒至刚凝固后盛出。",
      "炒软番茄，倒回鸡蛋调味即可。",
    ],
  }),
  createPublicRecipe({
    id: "public_recipe_02",
    name: "清蒸鲈鱼",
    description: "突出鲜味、适合全家人的清淡蒸菜。",
    category: "fish",
    coverEmoji: "🐟",
    cookMinutes: 25,
    tips: "水开后再放鱼，关火后焖两分钟。",
    ingredients: [
      { name: "鲈鱼", quantity: 1, unit: "条", category: "fish" },
      { name: "姜", quantity: 15, unit: "克", category: "vegetable" },
      { name: "蒸鱼豉油", quantity: 20, unit: "毫升", category: "seasoning" },
    ],
    steps: [
      "鲈鱼处理干净并放姜片。",
      "水开后蒸八至十分钟。",
      "倒掉盘中汁水，淋豉油和热油。",
    ],
  }),
  createPublicRecipe({
    id: "public_recipe_03",
    name: "青椒肉丝",
    description: "咸鲜微辣，适合作为工作日晚餐主菜。",
    category: "meat",
    coverEmoji: "🌶️",
    cookMinutes: 20,
    tips: "肉丝提前加少量淀粉抓匀，炒出来更嫩。",
    ingredients: [
      { name: "猪里脊", quantity: 250, unit: "克", category: "meat" },
      { name: "青椒", quantity: 3, unit: "个", category: "vegetable" },
      { name: "生抽", quantity: 15, unit: "毫升", category: "seasoning" },
    ],
    steps: [
      "里脊切丝腌制，青椒切丝。",
      "大火滑炒肉丝至变色。",
      "加入青椒快速翻炒并调味。",
    ],
  }),
  createPublicRecipe({
    id: "public_recipe_04",
    name: "蒜蓉生菜",
    description: "清脆爽口，给一桌菜补上一份绿色蔬菜。",
    category: "vegetable",
    coverEmoji: "🥬",
    cookMinutes: 10,
    tips: "全程大火快炒，生菜刚变软就出锅。",
    ingredients: [
      { name: "生菜", quantity: 500, unit: "克", category: "vegetable" },
      { name: "大蒜", quantity: 5, unit: "瓣", category: "vegetable" },
      { name: "蚝油", quantity: 10, unit: "克", category: "seasoning" },
    ],
    steps: [
      "生菜洗净沥干，大蒜切末。",
      "蒜末爆香后放入生菜。",
      "大火炒软，加入蚝油拌匀。",
    ],
  }),
  createPublicRecipe({
    id: "public_recipe_05",
    name: "冬瓜排骨汤",
    description: "汤清味鲜，适合周末提前炖上一锅。",
    category: "soup",
    coverEmoji: "🥣",
    cookMinutes: 70,
    tips: "冬瓜后放，避免久炖后碎散。",
    ingredients: [
      { name: "排骨", quantity: 500, unit: "克", category: "meat" },
      { name: "冬瓜", quantity: 600, unit: "克", category: "vegetable" },
      { name: "姜", quantity: 15, unit: "克", category: "vegetable" },
    ],
    steps: [
      "排骨冷水下锅焯净血沫。",
      "排骨与姜片炖四十分钟。",
      "加入冬瓜再炖十五分钟并调味。",
    ],
  }),
  createPublicRecipe({
    id: "public_recipe_06",
    name: "葱油拌面",
    description: "香气浓郁，早餐或一人食都很方便。",
    category: "staple",
    coverEmoji: "🍜",
    cookMinutes: 20,
    tips: "小火慢炸葱段，避免葱油发苦。",
    ingredients: [
      { name: "面条", quantity: 300, unit: "克", category: "staple" },
      { name: "小葱", quantity: 80, unit: "克", category: "vegetable" },
      { name: "生抽", quantity: 25, unit: "毫升", category: "seasoning" },
    ],
    steps: [
      "小葱切段，小火炸至焦黄。",
      "加入生抽和少量糖煮开。",
      "面条煮熟沥水，拌入葱油汁。",
    ],
  }),
  createPublicRecipe({
    id: "public_recipe_07",
    name: "小米南瓜粥",
    description: "温暖柔和的早餐粥，提前预约煮更省心。",
    category: "staple",
    coverEmoji: "🎃",
    cookMinutes: 45,
    tips: "南瓜切小块更容易煮化，粥会自然香甜。",
    ingredients: [
      { name: "小米", quantity: 120, unit: "克", category: "staple" },
      { name: "南瓜", quantity: 300, unit: "克", category: "vegetable" },
      { name: "清水", quantity: 1200, unit: "毫升", category: "other" },
    ],
    steps: [
      "小米淘洗，南瓜去皮切块。",
      "全部放入锅中大火煮开。",
      "转小火煮至浓稠，期间适当搅拌。",
    ],
  }),
  createPublicRecipe({
    id: "public_recipe_08",
    name: "香菇滑鸡",
    description: "鸡肉嫩滑、香菇入味，蒸制过程省心少油。",
    category: "meat",
    coverEmoji: "🍗",
    cookMinutes: 35,
    tips: "鸡肉腌制十五分钟再蒸，味道更均匀。",
    ingredients: [
      { name: "鸡腿肉", quantity: 500, unit: "克", category: "meat" },
      { name: "鲜香菇", quantity: 8, unit: "朵", category: "vegetable" },
      { name: "生抽", quantity: 20, unit: "毫升", category: "seasoning" },
    ],
    steps: [
      "鸡腿肉切块并腌制。",
      "香菇切片后与鸡肉拌匀。",
      "水开后上锅蒸二十分钟。",
    ],
  }),
  createPublicRecipe({
    id: "public_recipe_09",
    name: "家常豆腐",
    description: "外香内嫩、酱汁浓郁的经典家常菜。",
    category: "vegetable",
    coverEmoji: "🥢",
    cookMinutes: 25,
    tips: "豆腐煎到两面定型后再翻动，不容易碎。",
    ingredients: [
      { name: "北豆腐", quantity: 400, unit: "克", category: "vegetable" },
      { name: "木耳", quantity: 50, unit: "克", category: "vegetable" },
      { name: "豆瓣酱", quantity: 15, unit: "克", category: "seasoning" },
    ],
    steps: [
      "豆腐切片煎至两面金黄。",
      "炒香豆瓣酱，加入木耳。",
      "放回豆腐和少量水，焖至入味。",
    ],
  }),
  createPublicRecipe({
    id: "public_recipe_10",
    name: "虾仁蒸蛋",
    description: "细嫩好入口，适合老人和孩子共享。",
    category: "egg",
    coverEmoji: "🦐",
    cookMinutes: 20,
    tips: "蛋液与温水约一比一点五，蒸出的蛋更嫩。",
    ingredients: [
      { name: "鸡蛋", quantity: 3, unit: "个", category: "egg" },
      { name: "虾仁", quantity: 120, unit: "克", category: "fish" },
      { name: "温水", quantity: 250, unit: "毫升", category: "other" },
    ],
    steps: [
      "鸡蛋加温水打匀并过滤。",
      "盖上盘子蒸八分钟。",
      "摆入虾仁再蒸五分钟，淋少量生抽。",
    ],
  }),
  createPublicRecipe({
    id: "public_recipe_11",
    name: "可乐鸡翅",
    description: "甜咸入味、很受家庭成员欢迎的下饭菜。",
    category: "meat",
    coverEmoji: "🍗",
    cookMinutes: 35,
    tips: "收汁时勤翻动，避免糖分粘锅。",
    ingredients: [
      { name: "鸡中翅", quantity: 10, unit: "个", category: "meat" },
      { name: "可乐", quantity: 330, unit: "毫升", category: "other" },
      { name: "生抽", quantity: 20, unit: "毫升", category: "seasoning" },
    ],
    steps: [
      "鸡翅两面划刀并煎至微黄。",
      "倒入可乐和生抽煮开。",
      "中小火焖熟，最后大火收汁。",
    ],
  }),
  createPublicRecipe({
    id: "public_recipe_12",
    name: "紫菜蛋花汤",
    description: "五分钟就能完成的清爽快手汤。",
    category: "soup",
    coverEmoji: "🍲",
    cookMinutes: 8,
    tips: "蛋液沿锅边细细淋入，稍等几秒再搅动。",
    ingredients: [
      { name: "紫菜", quantity: 10, unit: "克", category: "vegetable" },
      { name: "鸡蛋", quantity: 2, unit: "个", category: "egg" },
      { name: "香油", quantity: 5, unit: "毫升", category: "seasoning" },
    ],
    steps: [
      "锅中加水煮开，放入紫菜。",
      "缓慢淋入蛋液形成蛋花。",
      "加盐和香油调味即可。",
    ],
  }),
];
