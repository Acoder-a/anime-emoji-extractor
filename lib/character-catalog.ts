import type { CharacterVisionPreset } from "./browser-analyzer";

export type CharacterOption = {
  id: string;
  name: string;
  folder: string;
  preset?: CharacterVisionPreset;
};

export type WorkOption = {
  id: string;
  name: string;
  folder: string;
  characters: CharacterOption[];
};

export type CountryOption = {
  id: string;
  name: string;
  works: WorkOption[];
};

const preset = (colors: string[], tolerance = 72): CharacterVisionPreset => ({ colors, tolerance });

export const characterCatalog: CountryOption[] = [
  {
    id: "japan",
    name: "日本动画",
    works: [
      { id: "doraemon", name: "哆啦A梦", folder: "Doraemon", characters: [
        { id: "doraemon", name: "哆啦A梦", folder: "Doraemon", preset: preset(["#1595d3", "#ffffff", "#e63b34"], 76) },
        { id: "nobita", name: "野比大雄", folder: "Nobita", preset: preset(["#f5dc43", "#273b78", "#f0c39f"], 68) },
        { id: "shizuka", name: "源静香", folder: "Shizuka", preset: preset(["#ef84a8", "#f4c7a4", "#3a2925"], 66) },
        { id: "gian", name: "刚田武（胖虎）", folder: "Gian", preset: preset(["#e68b35", "#30221d", "#d6b08a"], 70) },
        { id: "suneo", name: "骨川小夫", folder: "Suneo", preset: preset(["#4b79b8", "#342921", "#e0b28d"], 68) },
      ] },
      { id: "crayon-shinchan", name: "蜡笔小新", folder: "CrayonShinchan", characters: [
        { id: "shinnosuke", name: "野原新之助", folder: "Shinnosuke", preset: preset(["#e63b32", "#f1d243", "#e2aa86", "#241c1a"], 70) },
        { id: "misae", name: "野原美冴", folder: "Misae" },
        { id: "hiroshi", name: "野原广志", folder: "Hiroshi" },
        { id: "himawari", name: "野原向日葵", folder: "Himawari", preset: preset(["#f1d44d", "#e75d47", "#e3ad87"], 68) },
        { id: "shiro", name: "小白", folder: "Shiro", preset: preset(["#f5f4ea", "#272727"], 58) },
      ] },
      { id: "detective-conan", name: "名侦探柯南", folder: "DetectiveConan", characters: [
        { id: "conan", name: "江户川柯南", folder: "Conan", preset: preset(["#2d5f9d", "#d93937", "#efe9df"], 66) },
        { id: "ran", name: "毛利兰", folder: "RanMouri" },
        { id: "kaito", name: "怪盗基德", folder: "KaitoKid", preset: preset(["#f4f4f1", "#2d4e82"], 54) },
        { id: "ai", name: "灰原哀", folder: "AiHaibara" },
      ] },
      { id: "pokemon", name: "宝可梦", folder: "Pokemon", characters: [
        { id: "pikachu", name: "皮卡丘", folder: "Pikachu", preset: preset(["#f2d33b", "#d84834", "#27231f"], 68) },
        { id: "ash", name: "小智", folder: "AshKetchum" },
        { id: "meowth", name: "喵喵", folder: "Meowth", preset: preset(["#efe1b5", "#8b6338", "#cf3e39"], 68) },
      ] },
      { id: "one-piece", name: "航海王", folder: "OnePiece", characters: [
        { id: "luffy", name: "蒙奇·D·路飞", folder: "Luffy", preset: preset(["#d33b32", "#e7c64a", "#efb88f"], 70) },
        { id: "zoro", name: "罗罗诺亚·索隆", folder: "Zoro" },
        { id: "nami", name: "娜美", folder: "Nami" },
        { id: "chopper", name: "乔巴", folder: "Chopper" },
      ] },
      { id: "naruto", name: "火影忍者", folder: "Naruto", characters: [
        { id: "naruto", name: "漩涡鸣人", folder: "Naruto", preset: preset(["#eb8d2f", "#e1c44a", "#e8b18c"], 70) },
        { id: "sasuke", name: "宇智波佐助", folder: "Sasuke" },
        { id: "sakura", name: "春野樱", folder: "Sakura" },
        { id: "kakashi", name: "旗木卡卡西", folder: "Kakashi" },
      ] },
      { id: "dragon-ball", name: "龙珠", folder: "DragonBall", characters: [
        { id: "goku", name: "孙悟空", folder: "Goku", preset: preset(["#e77927", "#275ca4", "#e9b086"], 72) },
        { id: "vegeta", name: "贝吉塔", folder: "Vegeta" },
        { id: "bulma", name: "布尔玛", folder: "Bulma" },
      ] },
      { id: "chibi-maruko", name: "樱桃小丸子", folder: "ChibiMarukoChan", characters: [
        { id: "maruko", name: "樱桃子（小丸子）", folder: "Maruko", preset: preset(["#d83f3b", "#f4c341", "#2b2321"], 68) },
        { id: "tamae", name: "穗波玉", folder: "Tamae" },
        { id: "hanawa", name: "花轮和彦", folder: "Hanawa" },
      ] },
    ],
  },
  {
    id: "usa",
    name: "美国动画",
    works: [
      { id: "tom-and-jerry", name: "猫和老鼠", folder: "TomAndJerry", characters: [
        { id: "tom", name: "汤姆猫", folder: "Tom", preset: preset(["#68727a", "#e9e9df", "#d5b26d"], 66) },
        { id: "jerry", name: "杰瑞鼠", folder: "Jerry", preset: preset(["#9a5b35", "#d89965"], 62) },
        { id: "spike", name: "斯派克", folder: "Spike" },
      ] },
      { id: "family-guy", name: "恶搞之家", folder: "FamilyGuy", characters: [
        { id: "peter", name: "彼得·格里芬", folder: "PeterGriffin", preset: preset(["#f3f0e8", "#4d8f59", "#e9ba94"], 64) },
        { id: "lois", name: "洛伊丝·格里芬", folder: "LoisGriffin" },
        { id: "stewie", name: "斯图威·格里芬", folder: "StewieGriffin", preset: preset(["#f0c63e", "#d84c3d", "#e8ba91"], 68) },
        { id: "brian", name: "布莱恩", folder: "BrianGriffin", preset: preset(["#eeeae0", "#d74b3d", "#303030"], 56) },
        { id: "chris", name: "克里斯·格里芬", folder: "ChrisGriffin" },
        { id: "meg", name: "梅格·格里芬", folder: "MegGriffin" },
      ] },
      { id: "the-simpsons", name: "辛普森一家", folder: "TheSimpsons", characters: [
        { id: "homer", name: "霍默·辛普森", folder: "HomerSimpson", preset: preset(["#efd33f", "#f3f0e8", "#5196bc"], 66) },
        { id: "marge", name: "玛姬·辛普森", folder: "MargeSimpson", preset: preset(["#efd33f", "#315fa6", "#75a35c"], 66) },
        { id: "bart", name: "巴特·辛普森", folder: "BartSimpson", preset: preset(["#efd33f", "#dd5739", "#4f87b3"], 66) },
        { id: "lisa", name: "丽莎·辛普森", folder: "LisaSimpson" },
      ] },
      { id: "spongebob", name: "海绵宝宝", folder: "SpongeBobSquarePants", characters: [
        { id: "spongebob", name: "海绵宝宝", folder: "SpongeBob", preset: preset(["#efd948", "#8b5733", "#f5f1df"], 70) },
        { id: "patrick", name: "派大星", folder: "PatrickStar", preset: preset(["#e98787", "#87a84b"], 66) },
        { id: "squidward", name: "章鱼哥", folder: "Squidward", preset: preset(["#79aca2", "#9a623b"], 64) },
        { id: "mr-krabs", name: "蟹老板", folder: "MrKrabs" },
      ] },
      { id: "looney-tunes", name: "乐一通", folder: "LooneyTunes", characters: [
        { id: "bugs", name: "兔八哥", folder: "BugsBunny", preset: preset(["#8a8d8a", "#efeee6", "#dc6b76"], 62) },
        { id: "daffy", name: "达菲鸭", folder: "DaffyDuck", preset: preset(["#262a2d", "#e39c30", "#f0eee3"], 64) },
        { id: "tweety", name: "崔弟", folder: "Tweety", preset: preset(["#edd63d", "#dd8b34"], 66) },
      ] },
      { id: "mickey", name: "米奇与朋友们", folder: "MickeyAndFriends", characters: [
        { id: "mickey", name: "米奇", folder: "MickeyMouse", preset: preset(["#242323", "#d84039", "#ebc64d"], 66) },
        { id: "minnie", name: "米妮", folder: "MinnieMouse" },
        { id: "donald", name: "唐老鸭", folder: "DonaldDuck", preset: preset(["#f1f0e8", "#366fa7", "#e5a73b"], 62) },
        { id: "goofy", name: "高飞", folder: "Goofy" },
      ] },
      { id: "scooby-doo", name: "史酷比", folder: "ScoobyDoo", characters: [
        { id: "scooby", name: "史酷比", folder: "ScoobyDoo", preset: preset(["#9a6736", "#44736e", "#24211d"], 66) },
        { id: "shaggy", name: "夏奇", folder: "Shaggy" },
        { id: "velma", name: "维尔玛", folder: "Velma" },
      ] },
      { id: "south-park", name: "南方公园", folder: "SouthPark", characters: [
        { id: "cartman", name: "埃里克·卡特曼", folder: "Cartman", preset: preset(["#d84e42", "#4a79ad", "#e8bb83"], 68) },
        { id: "stan", name: "斯坦·马什", folder: "StanMarsh" },
        { id: "kyle", name: "凯尔·布罗夫洛夫斯基", folder: "KyleBroflovski" },
        { id: "kenny", name: "肯尼·麦考密克", folder: "KennyMcCormick", preset: preset(["#e78336", "#7b4d31"], 64) },
      ] },
    ],
  },
];

