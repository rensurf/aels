"""
Seed script: load 18 conversation topics into aels-topics DynamoDB.
Run: python -m src.tools.seed_topics
"""
import os
import sys
from dotenv import load_dotenv
load_dotenv()

from src.db.topics import TopicsClient
from src.config import DYNAMODB_TOPICS_TABLE, WEB_USER_ID

TOPICS_DATA = [
    {
        "number": 1,
        "title": "学校で勉強したこと",
        "bullets": [
            {"ja": "機械工学（学部）", "en": "mechanical engineering (undergrad)", "example": "I studied mechanical engineering for my undergrad."},
            {"ja": "コンピュータサイエンス（大学院）", "en": "computer science (grad school)", "example": "Then I switched to computer science for grad school."},
            {"ja": "なぜ転向したか", "en": "why I switched", "example": "I took a programming class and found it interesting, so I wanted to learn more about it."},
            {"ja": "最初は全然わからなかった", "en": "didn't understand at first", "example": "At first, I had no idea what was going on, but I somehow found it interesting."},
            {"ja": "小学校：活発な子・野球・バスケ", "en": "active kid, played baseball and basketball", "example": "I was a really active kid — I played both baseball and basketball."},
            {"ja": "中学校：成績トップ、少し調子に乗ってた", "en": "top grades, a bit overconfident", "example": "Middle school was probably the peak of my confidence. I got really good grades — even straight A's once."},
            {"ja": "高校：第一志望に落ちた", "en": "failed entrance exam, setbacks", "example": "High school was full of setbacks. I failed the entrance exam and ended up at my second-choice school."},
        ],
    },
    {
        "number": 2,
        "title": "今やっている仕事の内容",
        "bullets": [
            {"ja": "バックエンドエンジニア・2年以上", "en": "backend engineer, 2+ years", "example": "I'm a backend engineer with over two years of experience building production APIs and cloud-based systems."},
            {"ja": "LLM基盤の可観測性システム", "en": "LLM gateway observability system", "example": "Right now, I'm working on an LLM gateway observability system that tracks cost, usage, latency, and error rates."},
            {"ja": "APIパフォーマンス改善", "en": "API performance improvement", "example": "Before that, I was working on API performance improvements."},
            {"ja": "AIエージェント（カスタマーサクセス向け）", "en": "AI agent for customer success", "example": "I also worked on an AI agent to help customer success teams work more efficiently."},
        ],
    },
    {
        "number": 3,
        "title": "職歴",
        "bullets": [
            {"ja": "インターン→正社員→業務委託", "en": "intern → full-time → contractor", "example": "I started as an intern during grad school, joined full-time after graduating, then became a contractor after moving to Sydney."},
            {"ja": "シドニーに移住したため退職", "en": "left because I moved to Sydney", "example": "I left the company this March because I moved to Sydney."},
            {"ja": "マネージャーから業務委託で継続依頼", "en": "manager asked me to continue as contractor", "example": "My manager asked me to keep working with them as a contractor, so I've been doing that ever since."},
            {"ja": "人と環境が好きだった", "en": "liked the people and environment", "example": "One of the main reasons I joined was that I really liked the people and found the working environment very comfortable."},
            {"ja": "小さい会社で幅広く経験できた", "en": "broad experience at a small company", "example": "As a relatively small company, there were a lot of opportunities to take ownership and work on a wide range of things."},
        ],
    },
    {
        "number": 4,
        "title": "人生のターニングポイント",
        "bullets": [
            {"ja": "19歳でNZへ", "en": "went to New Zealand at 19", "example": "My turning point was when I went to New Zealand at 19."},
            {"ja": "初めての海外・世界中の人と話した", "en": "first time abroad, met people from all over", "example": "It was my first time abroad, and I got to talk with people from all over the world."},
            {"ja": "視野が広がり海外で働きたいと思った", "en": "broadened perspective, wanted to work abroad", "example": "That experience broadened my perspective and made me want to live and work abroad."},
            {"ja": "それ以来ずっとその目標に向かって", "en": "been working toward that ever since", "example": "I've been working toward that ever since."},
        ],
    },
    {
        "number": 5,
        "title": "大切にしている価値観",
        "bullets": [
            {"ja": "自分の時間を意図的に確保する", "en": "intentionally making time for myself", "example": "One of my core values is being intentional about making time for myself."},
            {"ja": "精神的にあまり強くないので", "en": "not mentally that strong", "example": "I'm not mentally that strong, so if I don't protect my own time, I tend to end up just going along with what other people want."},
            {"ja": "一人の時間が自分らしくいられる", "en": "alone time helps me stay true to myself", "example": "Having that alone time helps me stay true to myself."},
        ],
    },
    {
        "number": 6,
        "title": "将来やりたいこと",
        "bullets": [
            {"ja": "世界中の人と一緒に働く", "en": "work with people from all over the world", "example": "I want to surf and work with people from all over the world."},
            {"ja": "海の近くに住んでサーフィンしながら生活", "en": "live near the ocean, surf lifestyle", "example": "Ideally, I'd love to live near the ocean and surf while working as a software engineer — Australia would be perfect."},
            {"ja": "直近はオーストラリアで就職", "en": "short-term: get a job in Australia", "example": "My short-term goal is to get a job as a software engineer here in Australia."},
        ],
    },
    {
        "number": 7,
        "title": "今悩んでいること",
        "bullets": [
            {"ja": "特にない、強いて言えばオーストラリアの就活", "en": "not much; if anything, job hunting in Australia", "example": "Honestly, not much. But if I had to pick one thing, it'd be job hunting here in Australia."},
            {"ja": "1ヶ月経ってもまだオファーない", "en": "been a month, still no offer", "example": "It's been about a month since I started looking, and I still haven't received a job offer."},
            {"ja": "難しいほど面白いタイプ", "en": "the harder it is, the more I enjoy it", "example": "But I actually find it interesting — I'm the kind of person who gets more motivated when things get tough."},
        ],
    },
    {
        "number": 8,
        "title": "好きなこと・趣味",
        "bullets": [
            {"ja": "サーフィン（日本では毎週末兄と）", "en": "surfing, used to go every weekend with brother", "example": "One of my hobbies is surfing. Back in Japan, I used to go surfing with my older brother almost every weekend."},
            {"ja": "読書（英語で読むようにしている）", "en": "reading, try to read in English", "example": "Another hobby is reading. Whenever I have some free time, I try to read in English."},
            {"ja": "SNSはやっていない（時間の無駄）", "en": "don't use social media, waste of time", "example": "I haven't really used social media, especially Instagram, for almost seven or eight years. I know I'm easily influenced by other people."},
        ],
    },
    {
        "number": 9,
        "title": "休みの日の過ごし方",
        "bullets": [
            {"ja": "基本インドアでのんびり", "en": "pretty low-key, usually at home", "example": "I'm pretty low-key, so I'm usually at home — watching videos, reading, going for walks."},
            {"ja": "散歩が好き（考える時間）", "en": "love going for walks, thinking time", "example": "I especially like going for a walk because it's kind of my thinking time. Walking helps me organize my thoughts."},
            {"ja": "シドニーに来てからサーフィンしたい", "en": "now in Sydney, can surf whenever I want", "example": "But now I'm finally in Sydney, so I can go surfing whenever I want."},
        ],
    },
    {
        "number": 10,
        "title": "食べ物や旅などの好み",
        "bullets": [
            {"ja": "濃い味が好き、甘いものも", "en": "strong flavors, sweet tooth", "example": "Basically, I like strong flavors, both in food and drinks. I have a huge sweet tooth — the sweeter, the better."},
            {"ja": "辛いものはあまり得意じゃない", "en": "not into spicy food", "example": "I'm not really into spicy food, though."},
            {"ja": "行ったことある国：NZ・韓国・マレーシア", "en": "countries: NZ, Korea, Malaysia", "example": "The countries I've been to are New Zealand, South Korea, and Malaysia."},
            {"ja": "スシローおすすめ", "en": "recommend Sushiro (conveyor belt sushi)", "example": "As for Japanese food, sushi is definitely my favorite. If you ever go to Japan, I'd definitely recommend Sushiro — it's affordable and really good."},
        ],
    },
    {
        "number": 11,
        "title": "今・これまで住んでいた場所",
        "bullets": [
            {"ja": "名古屋（22歳まで）", "en": "Nagoya until 22, born and raised", "example": "I was born and raised in Nagoya and lived there until I was 22."},
            {"ja": "奈良（大学院・2年）", "en": "Nara for grad school, 2 years, relaxed atmosphere", "example": "Then I moved to Nara for grad school. It had a really relaxed and peaceful atmosphere."},
            {"ja": "大阪（仕事・2年）", "en": "Osaka for work, 2 years, great food and people", "example": "After that, I lived in Osaka for work for two years. It's a city with great food, plenty of things to do, and really nice people."},
            {"ja": "シドニー（今）・都市と自然のバランス", "en": "Sydney now, balance of city and nature", "example": "And now I'm in Sydney. I really love the balance between city life and nature here."},
        ],
    },
    {
        "number": 12,
        "title": "家族について",
        "bullets": [
            {"ja": "5人兄弟の大家族", "en": "big family, five kids including me", "example": "I've got a big family — five kids including me."},
        ],
    },
    {
        "number": 13,
        "title": "友達について",
        "bullets": [
            {"ja": "マレーシアやインドの国際的な友人", "en": "international friends from Malaysia, India", "example": "I have a few international friends — from Malaysia, India, and other countries."},
        ],
    },
    {
        "number": 14,
        "title": "好きな場所・人に紹介したいとき",
        "bullets": [
            {"ja": "大阪・特に難波", "en": "Osaka, especially Namba", "example": "If I had to recommend one place in Japan, I'd say Osaka — especially Namba."},
        ],
    },
    {
        "number": 15,
        "title": "日本のいいところ・問題だと思うこと",
        "bullets": [
            {"ja": "好きな点：食・安全・清潔・トイレ", "en": "like: food, safety, cleanliness, toilets", "example": "What I like about Japan: the food, the safety, the cleanliness, and honestly the toilets."},
            {"ja": "問題だと思う点：働き方・過労死", "en": "problem: work culture, karoshi", "example": "If I had to pick one thing, it's the work culture. There's even a word for it — karoshi, death from overwork."},
            {"ja": "空気読む文化・メリットデメリット両方", "en": "'read the room' culture, pros and cons", "example": "It has its pros and cons — people are considerate, but sometimes it comes at a cost to individuality."},
        ],
    },
    {
        "number": 16,
        "title": "英語をやることになったきっかけ",
        "bullets": [
            {"ja": "NZに行ったことがきっかけ（#4と同じ）", "en": "same as turning point — NZ at 19", "example": "It's actually the same as my turning point — going to New Zealand at 19."},
            {"ja": "大学院で多国籍な環境・マレーシア人の友人", "en": "diverse grad school, Malaysian friend", "example": "When I was in grad school, I had the chance to talk to people from all over the world. That's where I met one of my close friends — he's from Malaysia, and since he didn't speak Japanese, we communicated in English all the time."},
            {"ja": "英語で話し続けたことで上達した", "en": "got more comfortable by speaking constantly", "example": "I think that was one of the main reasons I became more comfortable speaking English."},
        ],
    },
    {
        "number": 17,
        "title": "過去の苦労した経験",
        "bullets": [],
    },
    {
        "number": 18,
        "title": "オーストラリアの生活全般",
        "bullets": [
            {"ja": "日本との時差は1時間だけ", "en": "only 1 hour time difference with Japan", "example": "I'm still working remotely for a Japanese company. Since Sydney is only one hour ahead of Japan, the time difference hasn't been a big issue."},
            {"ja": "英語環境・天気が好き", "en": "English environment, love the weather", "example": "I wanted to live in an English-speaking country, and I've always preferred warmer weather, so Australia really appealed to me."},
            {"ja": "都市と自然（サーフィン）のバランス", "en": "city + nature (surfing) balance", "example": "I also love that you can live in a major city and still have easy access to beaches where you can surf."},
        ],
    },
]


def main():
    if not WEB_USER_ID:
        print("Error: WEB_USER_ID not set in environment")
        sys.exit(1)

    client = TopicsClient(table_name=DYNAMODB_TOPICS_TABLE)
    existing = client.list_topics(user_id=WEB_USER_ID)
    if existing:
        print(f"Topics already exist ({len(existing)} topics). Skipping seed.")
        print("To re-seed, delete all topics first.")
        return

    print(f"Seeding {len(TOPICS_DATA)} topics for user {WEB_USER_ID}...")
    for topic_data in TOPICS_DATA:
        topic = client.put_topic(user_id=WEB_USER_ID, topic=topic_data)
        print(f"  #{topic_data['number']} {topic_data['title']} → {topic['topic_id']}")

    print("Done.")


if __name__ == "__main__":
    main()
