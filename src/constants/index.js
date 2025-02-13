export const projects = [
    {
        year: "2025",
        month: "1월",
        title: "기존 시스템 경량화",
        descriptions: [
            "무거워진 시스템을 필요한 기능만 추출하여 새로운 플랫폼 개발 ",
        ],
        skills: ['Java', 'React', 'Redis', 'Docker', "MySQL", "Kafka", "Node"],
    },
    {
        year: "2024",
        month: "6월",
        title: "기존 배치에 Spark 적용",
        descriptions: [
            "Script 방식으로 여러군데에 산개되어있던 파이프라인을 한 파이썬 배치로 모음",
            "한개로 통합되어 진행되던 배치를 [신규] 와 [기존] 으로 나누어 배치 실행하여 신규 등록한 파일이 기존 파일에 밀려 등록 안되는 문제를 해결"
        ],
        improves: ["1억 row 처리시간 기존 8시간 -> 30분으로 단축"],
        skills: ['Python', 'Spark', "Java", "MySQL", 'Batch'],
    },
    {
        year: "2024",
        month: "3월",
        title: "간단 지면 등록 페이지",
        descriptions: [
            "광고 플랫폼을 모르는 개인 지면을 가진 일반 사용자가 광고 지면 등록을 신청할수 있도록 만드는 챗봇 형식의 툴"
        ],
        improves: [],
        skills: ['React', 'Java', "MySQL", "JavaScript"],
    },
    {
        year: "2023",
        month: "6월",
        title: "슬랙 칭찬게시판",
        descriptions: [
            "기존 Slack Tacco 와 동일한 기능을 개발",
        ],
        improves: ["매달 사용자당 3$씩 나가던 요금 절약"],
        skills: ['Slack', 'Python', "Batch"],
    },
    {
        year: "2023",
        month: "5월",
        title: "Java batch to Python",
        descriptions: [
            "관리 포인트를 줄이기 위해 배치 서비스 Airflow 로 통합",
            "SCDF Java 로 관리되던 배치 전부 Airflow Python 으로 이관"
        ],
        improves: [],
        skills: ['Java', 'Python', 'Airflow', 'Batch'],
    },
    {
        year: "2023",
        month: "5월",
        title: "정산 페이지 이관",
        descriptions: [
            "FE, BE 가 PHP 원 소스로 통합되어 있던 정산 페이지를 Java, Vue 로 분리",
            "이관 작업시 테스트코드를 먼저 생성하여 데이터 정합성을 유지"
        ],
        improves: ["조회에 4분정도 걸리던 항목을 10초로 단축", "정산을 개발팀의 개입 전혀없이 가능하도록 모든 부분 자동화",],
        skills: ['Java', 'Spring', "Vue", "MySQL", "PHP", "JQuery", "Shell Script", "JavaScript", "TDD"],
    },
    {
        year: "2023",
        month: "3월",
        title: "영업부서 Medic 프로젝트",
        descriptions: [
            "BI 툴 형식의 영업팀들을 위한 대시보드 생성",
            "한눈에 올해 실적, 담당자별 매출, 전일대비 특정 항목을 볼 수 있음"
        ],
        improves: [],
        skills: ['Vue', 'MySQL', "Java", "JavaScript"],
    },
    {
        year: "2023",
        month: "1월",
        title: "PHP JAVA 이관",
        descriptions: [
            "레거시가 심각한 PHP 코드를 JAVA 로 이관하는 작업",
            "관리 안되는 변수를 이전 히스토리 분석을 통해 전부 ENUM, CONSTANT 로 관리"
        ],
        improves: ["조회에 30초 걸리던 리포트를 5초까지 단축", "쿼리 최적화, 서비스 로직 변경"],
        skills: ['Java', 'Spring', "MySQL", "Aerospike", "PHP"],
    },
    {
        year: "2022",
        month: "9월",
        title: "자동결제 배치",
        descriptions: [
            "금액이 일정 이하로 내려갈 경우 등록해둔 카드에서 자동으로 금액이 결제되는 배치 개발",
        ],
        improves: ["전체 매출의 10% 정도 자동결제 사용"],
        skills: ['Java', 'Spring', 'SCDF', 'Jenkins', 'Batch', "MySQL"],
    },
    {
        year: "2022",
        month: "7월",
        title: ["와이더플래닛 인턴 입사"],
        descriptions: ["채용연계형 6개월 인턴"],
        improves: [],
        skills: [],
    },
    {
        year: "2021",
        month: "12월",
        title: "내부 BI툴 개발",
        descriptions: [
            "영업 성과, 매출, 사용자들을 한눈에 보기 편하도록 도움을 주는 BI 툴 개발",
            "개발 당시 MOCK 데이터로만 작업"
        ],
        improves: [],
        skills: ['Python', 'Django'],
    },
    {
        year: "2021",
        month: "11월",
        title: "메이사 인턴 입사",
        descriptions: ["대학교 3개월 인턴"],
        improves: [],
        skills: [],
    },
];

export const experiences = [
    {title: "Spark 첫 사용", description: "처음하기엔 너무 큰 데이터...", image: "/spark.png", url: '/1'},
    {title: "제목2", description: "간단 내용2", image: "/alcong.jpg", url: "/2"},
    {title: "제목3", description: "간단 내용3", image: "/alcong.jpg", url: '/3'},
    {title: "제목4", description: "간단 내용4", image: "/alcong.jpg", url: '/4'},
];

export const skills = {
    backend: ["Python", "Java", "PHP", "Spring", "Django", "Flask", "Batch", "Airflow"],
    devOps: ["Redis", "Aerospike", "Spark", "Docker", "Kafka", "MySQL", "Shell Script"],
    frontend: ["React", "Vue", "JavaScript", "Node", "JQuery"],
    communication: ["Slack", "Git", "Atlassian", "Notion"],
};

export const categoryColors = {
    Backend: "primary",
    DevOps: "success",
    Frontend: "secondary",
    Communication: "warning",
};