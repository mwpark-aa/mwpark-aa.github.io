import React from 'react';
import Toys from "../toys";

const Documents = () => {
    return (
        <div className="container">
            <style>{`
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body, :root {
            font-family: 'Malgun Gothic', sans-serif;
            line-height: 1.6;
            color: #333;
            background-color: #f8f9fa;
        }

        .container {
            max-width: 1000px;
            margin: 0 auto;
            background: white;
            min-height: 100vh;
        }

        /* Header */
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 60px 40px;
            text-align: center;
        }

        .profile-image {
            width: 150px;
            height: 150px;
            border-radius: 50%;
            margin: 0 auto 30px;
            background: rgba(255, 255, 255, 0.1);
            border: 4px solid rgba(255, 255, 255, 0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 48px;
        }

        .name {
            font-size: 3rem;
            font-weight: 700;
            margin-bottom: 10px;
        }

        .title {
            font-size: 1.5rem;
            font-weight: 300;
            opacity: 0.9;
            margin-bottom: 20px;
        }

        .contact-info {
            font-size: 1.1rem;
        }

        .contact-info span {
            margin: 0 15px;
        }

        /* Main Content */
        .content {
            padding: 60px 40px;
        }

        .section {
            margin-bottom: 50px;
        }

        .section-title {
            font-size: 2.125rem;
            color: #111;
            font-weight: 800;
            line-height: 1.25;
            letter-spacing: -0.01em;
            margin: 6px 0 28px;
            padding: 0;
            display: flex;
            align-items: center;
            gap: 12px;
            scroll-margin-top: 80px;
            border: 0;
        }

        .section-title::before {
            content: "";
            display: inline-block;
            width: 6px;
            height: 1.2em;
            background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
            border-radius: 3px;
        }

        /* Summary */
        .summary {
            font-size: 1.1rem;
            line-height: 1.8;
            color: #555;
            text-align: justify;
        }

        /* About hero in main (소개 섹션 강조 이미지 레이아웃) */
        .about-hero {
            display: grid;
            grid-template-columns: 280px 1fr;
            gap: 24px;
            align-items: center;
        }

        .about-photo {
            width: 240px;
            height: 240px;
            border-radius: 50%;
            object-fit: cover;
            border: 6px solid rgba(102, 126, 234, 0.25);
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
            background: #eef2ff;
            display: block;
            margin: 0 auto;
        }

        .summary-content { }

        /* About checklist cards */
        .about-checklist-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
            gap: 16px;
            margin-top: 4px;
        }

        .about-check-card {
            background: transparent;
            border: 0;
            border-radius: 0;
            padding: 0;
        }

        .about-check-title {
            font-size: 1.05rem;
            color: #333;
            font-weight: 700;
            margin-bottom: 8px;
        }

        .about-check-list {
            margin: 0;
            padding-left: 18px;
            list-style: disc;
        }

        .about-check-list li {
            color: #555;
            margin-bottom: 6px;
            line-height: 1.65;
        }

        .about-check-list li::marker {
            color: #667eea;
        }

        .about-source {
            display: none;
        }

        /* About features (right side bullets like sample) */
        .about-features {
            display: grid;
            gap: 18px;
        }

        .feature { }

        .feature-title {
            font-size: 1.05rem;
            font-weight: 700;
            color: #333;
            margin-bottom: 6px;
            position: relative;
            padding-left: 22px;
        }

        .feature-title:before {
            content: "✓";
            position: absolute;
            left: 0;
            top: 0;
            color: #667eea;
            font-weight: 800;
        }

        .feature-text {
            color: #555;
            font-size: 0.9rem;
            line-height: 1.4;
        }

        /* Skills */
        .skills-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 30px;
            margin-top: 20px;
        }

        .skill-category h3 {
            color: #667eea;
            font-size: 1.2rem;
            text-align: center;
            margin-bottom: 15px;
        }

        .skill-list {
            list-style: none;
        }

        .skill-list li {
            background: #f8f9fa;
            padding: 8px 15px;
            margin-bottom: 8px;
            border-radius: 20px;
            border-left: 3px solid #667eea;
        }

        /* Experience */
        .experience-item {
            background: #f8f9fa;
            padding: 30px;
            margin-bottom: 25px;
            border-radius: 10px;
            border-left: 5px solid #667eea;
        }

        .company-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 15px;
        }

        .company-names {
            display: flex;
            flex-direction: column;
        }

        .previous-company {
            font-size: 0.8rem;
            color: #666;
        }

        .company-name {
            font-size: 1.5rem;
            color: #333;
            font-weight: 600;
        }

        .period {
            color: #666;
            font-size: 1rem;
            white-space: nowrap;
        }

        .position {
            color: #667eea;
            font-size: 1.1rem;
            font-weight: 500;
            margin-bottom: 15px;
        }

        .description {
            color: #555;
            line-height: 1.7;
        }

        /* Projects */
        .projects-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(450px, 1fr));
            gap: 30px;
        }

        .project-card {
            background: #f8f9fa;
            padding: 25px;
            border-radius: 10px;
            border: 1px solid #e9ecef;
            margin-bottom: 30px;
        }

        .project-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 15px;
        }

        .project-title {
            font-size: 1.3rem;
            color: #333;
            font-weight: 600;
            flex: 1;
        }

        .project-date {
            color: #666;
            font-size: 0.9rem;
            white-space: nowrap;
            margin-left: 15px;
        }

        .project-section-title {
            font-size: 1.15rem;
            color: #667eea;
            margin-top: 28px;
            margin-bottom: 12px;
            font-weight: bold;
            border-left: 4px solid #764ba2;
            padding-left: 10px;
        }

        .project-description, .project-slot {
            color: #555;
            line-height: 1.7;
            margin-bottom: 16px;
        }

        .project-image {
            width: 100%;
            max-width: 100%;
            height: auto;
            display: block;
            margin: 15px auto 25px auto;
            border-radius: 8px;
            border: 1px solid #ddd;
        }

        .project-container {
            display: flex;
            justify-content: center;
            gap: 20px;
        }

        /* [UI 개선] 이미지 Before/After 뱃지 & 캡션 */
        .project-figure {
            position: relative;
            margin: 10px 0 24px;
        }
        .image-badge {
            position: absolute;
            top: 10px;
            left: 10px;
            background: #6c757d;
            color: #fff;
            padding: 4px 10px;
            border-radius: 999px;
            font-size: 0.75rem;
            font-weight: 700;
            letter-spacing: 0.02em;
            box-shadow: 0 2px 6px rgba(0,0,0,0.15);
        }
        .image-badge.success { background: #28a745; }
        .image-caption {
            text-align: center;
            color: #666;
            font-size: 0.9rem;
            margin-top: -10px;
        }

        .achievement {
            background: white;
            padding: 10px 15px;
            margin-bottom: 8px;
            border-radius: 5px;
            color: #555;
            border-left: 3px solid #28a745;
        }

        .code-block {
            font-family: "Courier New", Courier, monospace;
            font-size: 0.9rem;
            color: #e83e8c;
            background-color: #f8f9fa;
            padding: 0.2em 0.4em;
            border-radius: 4px;
            border: 1px solid #e1e1e1;
            white-space: nowrap;
        }

        .tech-stack {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .stack-group {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            align-items: center;
        }

        .stack-label {
            flex: 0 0 120px;
            color: #333;
            padding: 2px 8px;
            border-radius: 10px;
            font-weight: 700;
            font-size: 0.9rem;
            letter-spacing: 0.01em;
        }

        /* 모든 항목 칩을 2열(항목 영역)로 강제 배치하여 시작 위치를 통일 */
        .stack-group .tech-tag {
            grid-column: 2;
        }

        .tech-tag {
            background: #667eea;
            color: white;
            padding: 4px 12px;
            border-radius: 15px;
            font-size: 0.85rem;
        }

        /* Project Summary (clickable) */
        .summary-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            align-items: stretch;
        }

        .summary-card {
            background: #f8f9fa;
            border: 1px solid #e9ecef;
            border-radius: 10px;
            padding: 18px 20px;
            cursor: pointer;
            transition: background-color 0.15s ease, border-color 0.15s ease;
            display: flex;
            flex-direction: column;
            height: 100%;
            min-height: 120px;
        }

        .summary-card:hover {
            background: #f1f3f5;
            border-color: #667eea;
        }

        .summary-title {
            font-size: 1.05rem;
            color: #333;
            font-weight: 600;
            margin-bottom: 6px;
        }

        .summary-desc {
            color: #666;
            font-size: 0.95rem;
        }

        .summary-link {
            color: inherit;
            text-decoration: none;
            display: block;
        }

        /* Footer */
        .footer {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 24px 40px;
            text-align: center;
        }

        .footer small {
            opacity: 0.9;
        }

        /* Responsive */
        @media (max-width: 768px) {
            .container {
                margin: 0;
            }

            .header,
            .content {
                padding: 30px 20px;
            }

            .name {
                font-size: 2.2rem;
            }

            .title {
                font-size: 1.2rem;
            }

            .contact-info {
                font-size: 1rem;
            }

            .contact-info span {
                display: block;
                margin: 5px 0;
            }

            .section-title {
                font-size: 1.75rem;
                line-height: 1.25;
                gap: 10px;
            }

            .company-header {
                flex-direction: column;
                align-items: flex-start;
            }

            .period {
                margin-top: 5px;
            }

            .projects-grid {
                grid-template-columns: 1fr;
            }

            .project-header {
                flex-direction: column;
                align-items: flex-start;
            }

            .project-date {
                margin-left: 0;
                margin-top: 5px;
            }
        }

        @media (max-width: 480px) {
            .skills-grid,
            .contact-grid {
                grid-template-columns: 1fr;
            }

            .name {
                font-size: 1.8rem;
            }

            .section-title {
                font-size: 1.5rem;
                line-height: 1.2;
            }

            .tech-stack {
                justify-content: center;
            }
        }

        /* Responsive (about-hero tweaks) */
        @media (max-width: 768px) {
            .about-hero {
                grid-template-columns: 1fr;
            }

            .about-photo {
                width: 200px;
                height: 200px;
                margin: 0 auto 16px;
            }
        }

        /* Responsive alignment for stack-group label column */
        @media (max-width: 900px) {
            .stack-group { grid-template-columns: 140px 1fr; }
        }
        @media (max-width: 600px) {
            .stack-group { grid-template-columns: 120px 1fr; }
        }
        @media (max-width: 420px) {
            .stack-group { grid-template-columns: 100px 1fr; }
        }

        /* Print */
        @media print {
          .system .box { background: #fff !important; border-color: #000 !important; }
        }

        /* Textual architecture flow styles */
        .arch-flow {
            margin: 0 0 12px 0;
            padding-left: 18px;
            list-style: decimal;
            color: #555;
            line-height: 1.6;
        }
        .arch-flow li { margin-bottom: 6px; }

        /* Block diagram (Flex-based) */
        .system { display: flex; gap: 30px; justify-content: center; margin-top: 16px; flex-wrap: wrap; }
        .system .box { padding: 14px 28px; border: 2px solid #333; border-radius: 12px; background: #fff; font-weight: 700; color: #222; }
        .system .box.fe { background: #bbd0ff; }
        .system .box.be { background: #ffc9c9; }
        .system .box.db { background: #c0f2c0; }
        @media (max-width: 600px) {
          .system { gap: 12px; }
          .system .box { padding: 10px 18px; border-radius: 10px; font-weight: 600; }
        }
      `}</style>

            {/* Header */}
            <header className="header">
                <div className="profile-image" role="img" aria-label="개발자 아이콘">👨‍💻</div>
                <h1 className="name">박민우</h1>
                <h2 className="title">불편함을 해결하려 노력하는 개발자</h2>
                <div className="contact-info">
                    <span>📧 alsdndia789@naver.com</span>
                    <span>📱 010-7324-4510</span>
                </div>
            </header>

            {/* Main Content */}
            <main className="content">
                {/* Summary */}
                <section className="section" id="about">
                    <h2 className="section-title">소개</h2>
                    <div className="about-hero">
                        <div className="about-photo-wrap">
                            <img alt="박민우 프로필 사진" className="about-photo" src="/me.jpg"/>
                        </div>
                        <div className="summary summary-content">
                            <div className="about-features">
                                <div className="feature">
                                    <div className="feature-title">빠른 학습과 적응력</div>
                                    <p className="feature-text">
                                        새로운 기술과 요구사항에도 빠르게 적응하며, 짧은 시간 안에 프로젝트에 필요한 지식을 습득하고 적용할 수 있습니다. 변화가 많은 환경에
                                        자신있습니다.
                                    </p>
                                </div>
                                <div className="feature">
                                    <div className="feature-title">빠른 개발 속도와 효율성</div>
                                    <p className="feature-text">
                                        복잡한 요구사항도 명확한 구조와 최적화된 설계로 빠르게 구현합니다.
                                    </p>
                                </div>
                                <div className="feature">
                                    <div className="feature-title">자발적 문제 해결과 주도적 업무 수행</div>
                                    <p className="feature-text">
                                        주어진 업무뿐 아니라 필요한 작업을 스스로 찾아내고 실행합니다. 장애 대응, 성능 개선, 신규 기능 제안 등에서 주도적으로 프로젝트 성과를
                                        높입니다.
                                    </p>
                                </div>
                                <div className="feature">
                                    <div className="feature-title">원활한 코드 리뷰와 협업</div>
                                    <p className="feature-text">
                                        팀 내 코드 리뷰를 통해 품질을 유지하고, 명확한 피드백으로 동료 개발자의 성장과 협업 효율을 높입니다. 문서화와 커뮤니케이션에도 신경을 써 팀
                                        전반의 개발 생산성을 향상시킵니다.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* Skills */}
                <section className="section" id="skills">
                    <h2 className="section-title">기술 스택</h2>
                    <div className="skills-grid">
                        <div className="skill-category">
                            <h3>Backend</h3>
                            <ul className="skill-list">
                                <li>Java</li>
                                <li>Python</li>
                                <li>PHP</li>
                                <li>Spring Boot</li>
                                <li>JPA</li>
                                <li>MyBatis</li>
                                <li>Batch</li>
                            </ul>
                        </div>
                        <div className="skill-category">
                            <h3>Frontend</h3>
                            <ul className="skill-list">
                                <li>JavaScript</li>
                                <li>React</li>
                                <li>Vue</li>
                            </ul>
                        </div>
                        <div className="skill-category">
                            <h3>Database & Cloud</h3>
                            <ul className="skill-list">
                                <li>MySQL</li>
                                <li>Redis</li>
                                <li>Aerospike</li>
                                <li>AWS S3</li>
                                <li>GCP</li>
                            </ul>
                        </div>
                        <div className="skill-category">
                            <h3>DevOps & Tools</h3>
                            <ul className="skill-list">
                                <li>Docker</li>
                                <li>Airflow</li>
                                <li>Git</li>
                                <li>Spark</li>
                                <li>OpenSearch</li>
                            </ul>
                        </div>
                    </div>
                </section>

                {/* Experience */}
                <section className="section" id="experience">
                    <h2 className="section-title">경력</h2>

                    <div className="experience-item">
                        <div className="company-header">
                            <div className="company-names">
                                <h3 className="company-name">(주)아티스트유나이티드</h3>
                            </div>
                            <span className="period">2022.07 - 재직중</span>
                        </div>
                        <div className="position">매니저</div>
                        <div className="description">
                            초기에는 관리자 페이지의 백엔드 개발을 주로 담당했으며, 이후 프론트엔드·데이터 처리·광고 송출(DSP)까지 개발 영역으로 확장했습니다.
                            쿼리 최적화와 배치 파이프라인 개선으로 <strong>8시간 배치를 30분으로 단축</strong>했습니다.
                            또한 정산 시스템을 전면 자동화하고 <strong>페이지 로딩 120초 → 4초</strong>로 개선하여 운영 효율을 크게 높였습니다.
                        </div>
                    </div>

                    <div className="experience-item">
                        <div className="company-header">
                            <h3 className="company-name">메이사</h3>
                            <span className="period">2021.11 - 2021.12</span>
                        </div>
                        <div className="position">인턴</div>
                        <div className="description">
                            관리자가 영업 매출과 사용자 현황을 간단하게 볼 수 있는 BI 툴을 Python Django로 개발했습니다.
                            데이터 시각화와 리포팅 기능을 구현하여 업무 효율성을 향상시켰습니다.
                        </div>
                    </div>
                </section>

                {/* Project Summary */}
                <section className="section" id="project-summary">
                    <h2 className="section-title">프로젝트 요약</h2>
                    <div className="summary-grid">
                        <a className="summary-link" href="#project-mcp">
                            <div className="summary-card">
                                <div className="summary-title">MCP 개발</div>
                                <div className="summary-desc">업무 자동화와 검색 접근성 향상, 작업 처리속도 최대 5분까지 단축</div>
                            </div>
                        </a>
                        <a className="summary-link" href="#project-lightweight-dsp">
                            <div className="summary-card">
                                <div className="summary-title">기존 광고 경량화 버전 개발</div>
                                <div className="summary-desc">핵심 기능 중심의 경량 DSP로 이관, 운영 효율 증대</div>
                            </div>
                        </a>
                        <a className="summary-link" href="#project-dmp">
                            <div className="summary-card">
                                <div className="summary-title">DMP 송출 개발</div>
                                <div className="summary-desc">대용량 파이프라인 통합 및 최적화, 8시간 → 30분</div>
                            </div>
                        </a>
                        <a className="summary-link" href="#project-settlement">
                            <div className="summary-card">
                                <div className="summary-title">정산 페이지 이관</div>
                                <div className="summary-desc">정산 완전 자동화 및 로딩 120초 → 4초</div>
                            </div>
                        </a>
                        <a className="summary-link" href="#project-pg-batch">
                            <div className="summary-card">
                                <div className="summary-title">자동결제(PG) 배치 개발</div>
                                <div className="summary-desc">잔액 기준 자동 결제 구현, 전체 매출의 10% 자동결제로 전환</div>
                            </div>
                        </a>
                        <a className="summary-link" href="#project-batch-migration">
                            <div className="summary-card">
                                <div className="summary-title">배치 플랫폼/언어 이관</div>
                                <div className="summary-desc">SCDF→Airflow, Java→Python 일원화로 유지보수 지점 축소</div>
                            </div>
                        </a>
                        <a className="summary-link" href="#project-dynamic-template">
                            <div className="summary-card">
                                <div className="summary-title">다이나믹 템플릿 컴포넌트 개선</div>
                                <div className="summary-desc">조건 분기 제거·컴포넌트화로 추가 속도/안정성 향상</div>
                            </div>
                        </a>
                    </div>
                </section>

                {/* Projects */}
                <section className="section" id="projects">
                    <h2 className="section-title">주요 프로젝트</h2>
                    <div className="projects-grid">

                        <div className="project-card" id="project-mcp">
                            <div className="project-header">
                                <h3 className="project-title">사내 전용 MCP 개발</h3>
                                <span className="project-date">2025.08 - 2025.08</span>
                            </div>
                            <div className="project-section-title">시스템 구성도</div>
                            <img className="project-image" src="/mcp.png" alt="경량 DSP 시스템 구성도" loading="lazy"/>
                            <div className="project-section-title">프로젝트 동기</div>
                            <div className="project-description project-slot">
                                <div className="project-description">
                                    신규 기술인 MCP 에 대해 알아보고, 이를 활용할 방안에 대해서 고민하다가
                                    Jira 일감과 슬랙 링크 중심으로 흩어진 업무 정보를 모아 자동으로 정리·검색하고, 반복 업무를 단축 가능할거 같다고 생각하여 작업했습니다.
                                    비개발자는 개발자의 도움없이 데이터를 쉽게 조회할수 있도록 도와주고 개발자는 이슈 맥락을 빠르게 파악해 처리 속도를 높이는 것을 목표로 잡았습니다.
                                </div>
                            </div>

                            <div className="project-section-title">성과 및 임팩트</div>
                            <div className="project-description">
                                <div className="achievement">✅ 사내 개발자들에게 MCP 에 대한 관심도 증가</div>
                                <div className="achievement">✅ 단순 개발 작업 처리속도 최대 5분으로 단축</div>
                                <div className="achievement">✅ 데이터 조회 요청량 주 2회정도에서 월 1회로 감소</div>
                            </div>

                            <div className="project-section-title">트러블슈팅 및 해결 경험</div>
                            <div className="project-description project-slot">
                                <div className="project-description">
                                    초기에 토큰 사용량이 너무 많아, 몇번의 질문으로 모든 토큰을 사용하는 문제가 있었습니다. 이를 해결하기 위해
                                    claude 에게 요청전 가능한 스크립트 수나 요청을 요약하는 과정을 거쳤고 이를 통해 토큰 사용량을 줄였습니다.
                                </div>
                                <div className="project-description">
                                    OpenSearch 의 경우 변수 매핑을 하는데 어려움이 있었습니다. 만약 사용자가 "무신사 카테고리를 조회한 유저 목록 추출해줘" 같은 요청을 했을때
                                    해당 값을 조회하기 위해서는 "무신사" 에 해당하는 DB 에 저장된 변수값을 찾아야하고, 카테고리에 대한 변수명을 찾아 요청해야 했습니다. 이를 위해
                                    모든 필드의 메타데이터 값을 재정의해 script 로 만들어 요청때 참고하게 하였습니다.
                                </div>
                            </div>

                            <div className="project-section-title">핵심 기술 스택</div>
                            <div className="tech-stack">
                                <div className="stack-group">
                                    <span className="stack-label">협업/통합</span>
                                    <span className="tech-tag">Jira</span>
                                    <span className="tech-tag">Slack</span>
                                </div>
                                <div className="stack-group">
                                    <span className="stack-label">데이터/검색</span>
                                    <span className="tech-tag">OpenSearch</span>
                                </div>
                                <div className="stack-group">
                                    <span className="stack-label">백엔드</span>
                                    <span className="tech-tag">Python</span>
                                </div>
                                <div className="stack-group">
                                    <span className="stack-label">AI/에이전트</span>
                                    <span className="tech-tag">MCP</span>
                                    <span className="tech-tag">Claude</span>
                                </div>
                            </div>
                        </div>

                        <div className="project-card" id="project-lightweight-dsp">
                            <div className="project-header">
                                <h3 className="project-title">기존 광고 경량화 버전 개발</h3>
                                <span className="project-date">2025.01 ~ 진행중</span>
                            </div>
                            <div className="project-section-title">시스템 구성도</div>
                            <img className="project-image" src="/adserver.png" alt="경량 DSP 시스템 구성도"
                                 loading="lazy"/>
                            <div className="project-section-title">프로젝트 동기</div>
                            <div className="project-description project-slot">
                                <div className="project-description">
                                    기존 DSP 플랫폼의 레거시가 심해져 복잡도와 유지보수 비용을 줄이고 핵심 기능 위주의 경량 플랫폼으로 이관하여 운영 효율을 높이기 위해서 기획,
                                    진행했습니다.
                                </div>
                            </div>
                            <div className="project-section-title">성과 및 임팩트</div>
                            <div className="project-description">
                                <div className="achievement">✅ 웹개발 FE, BE 작업의 90% 이상 처리</div>
                                <div className="achievement">✅ DaumKakao RTB (OpenRTB 스펙) 연동</div>
                                <div className="achievement">✅ 도메인 차단, 패스백, ADID & IDFA 송출 기능 개발</div>
                                <div className="achievement">✅ DB, 프로젝트 구조 구체화</div>
                            </div>
                            <div className="project-section-title">트러블슈팅 및 해결 경험</div>
                            <div className="project-description project-slot">
                                <div className="project-description">
                                    설계단계 부터 모든걸 시작하다보니 컨벤션, 폴더구조등을 전부 처음부터 만들어야하는 문제가 있었는데 이를 팀원들과 하나씩 조율해가며 완성시켜감.
                                    처음에 기획했던대로 최종 구조가 만들어지지는 않았지만 특정 기술스택을 왜 사용하는지에 대해 파악하며 최신 기술들로 잘 만들었음.
                                </div>
                                <div className="project-description">
                                    Kafka, OpenSearch 등 처음 접해보는 기술을 적용하고 적응함.
                                </div>
                            </div>
                            <div className="project-section-title">핵심 기술 스택</div>
                            <div className="tech-stack">
                                <div className="stack-group">
                                    <span className="stack-label">백엔드</span>
                                    <span className="tech-tag">Java</span>
                                    <span className="tech-tag">OpenRTB</span>
                                    <span className="tech-tag">MSA</span>
                                </div>
                                <div className="stack-group">
                                    <span className="stack-label">데이터/처리</span>
                                    <span className="tech-tag">Kafka</span>
                                    <span className="tech-tag">OpenSearch</span>
                                    <span className="tech-tag">Redis</span>
                                    <span className="tech-tag">MySQL</span>
                                </div>
                                <div className="stack-group">
                                    <span className="stack-label">프론트엔드</span>
                                    <span className="tech-tag">React</span>
                                </div>
                                <div className="stack-group">
                                    <span className="stack-label">인프라/운영</span>
                                    <span className="tech-tag">Docker</span>
                                </div>
                            </div>
                        </div>

                        <div className="project-card" id="project-dmp">
                            <div className="project-header">
                                <h3 className="project-title">DMP 송출 개발</h3>
                                <span className="project-date">2024.06 - 2024.08</span>
                            </div>
                            <div className="project-section-title">시스템 구성도</div>
                            <img alt="DMP 송출 시스템 다이어그램" className="project-image" src="/dmp.png"/>
                            <div className="project-section-title">프로젝트 동기</div>
                            <div className="project-description project-slot">
                                <div className="project-description">
                                    여러 저장소에 산재한 스크립트와 수동 프로세스를 단일화하여 안정적인 대용량 처리와 운영 자동화를 달성하기 위함.
                                </div>
                            </div>
                            <div className="project-section-title">성과 및 임팩트</div>
                            <div className="project-description">
                                <div className="achievement">처리 속도 8시간 → 30분 (16배 성능 개선)</div>
                                <div className="achievement">TG 광고의 30% 이상이 DMP 캠페인 사용</div>
                                <div className="achievement">대용량 데이터 처리 최적화 경험 축적</div>
                            </div>
                            <div className="project-section-title">트러블슈팅 및 해결 경험</div>
                            <div className="project-description project-slot">
                                <div className="project-description">
                                    일부 파일 용량이 너무 커서 OOM 이 발생했는데 이를 파이썬 제너레이터나 Set 같은 자료구조를 활용해 해결함.
                                </div>
                            </div>
                            <div className="project-section-title">핵심 기술 스택</div>
                            <div className="tech-stack">
                                <div className="stack-group">
                                    <span className="stack-label">백엔드</span>
                                    <span className="tech-tag">Java</span>
                                    <span className="tech-tag">Python</span>
                                </div>
                                <div className="stack-group">
                                    <span className="stack-label">데이터/처리</span>
                                    <span className="tech-tag">Spark</span>
                                    <span className="tech-tag">Airflow</span>
                                    <span className="tech-tag">Aerospike</span>
                                </div>
                            </div>
                        </div>

                        <div className="project-card" id="project-settlement">
                            <div className="project-header">
                                <h3 className="project-title">정산 페이지 이관</h3>
                                <span className="project-date">2023.05 - 2023.06</span>
                            </div>
                            <div className="project-section-title">시스템 구성도</div>
                            <div className="project-container">
                                <figure className="project-figure">
                                    <span className="image-badge">Before</span>
                                    <img className="project-image" src="/finance.png" alt="정산 페이지 개선 전"/>
                                    <figcaption className="image-caption">개선 전 (Before)</figcaption>
                                </figure>
                                <figure className="project-figure">
                                    <span className="image-badge success">After</span>
                                    <img alt="정산 페이지 시스템 다이어그램 (개선 후)" className="project-image"
                                         src="/finance-2.png"/>
                                    <figcaption className="image-caption">개선 후 (After)</figcaption>
                                </figure>
                            </div>
                            <div className="project-section-title">프로젝트 동기</div>
                            <div className="project-description project-slot">
                                <div className="project-description">
                                    레거시 단일 파일 PHP 정산 페이지의 유지보수 한계를 해소하고, 자동화 재구성하여 운영 리스크와 인력 의존도를 제거.
                                </div>
                            </div>
                            <div className="project-section-title">성과 및 임팩트</div>
                            <div className="project-description">
                                <div className="achievement">조회 속도 120초 → 4초 (30배 성능 개선)</div>
                                <div className="achievement">개발자 수동 작업 완전 제거 및 정산 과정 완전 자동화</div>
                            </div>
                            <div className="project-section-title">트러블슈팅 및 해결 경험</div>
                            <div className="project-description project-slot">
                                <div className="project-description">
                                    기존 변수명이 너무 모호하고, 객체 depth 가 너무 깊어 코드 자체를 이해하는데에 시간이 소요됨. php 에서 객체가 7depth 까지 있는 경우도
                                    있었는데 이를
                                    java 에서 최대 2 depth 까지 줄이며 개선함.
                                </div>
                                <div className="project-description">
                                    테스트 코드를 통한 데이터 정합성 체크 파이프라인을 구성하여 신뢰성 확보.
                                </div>
                            </div>
                            <div className="project-section-title">핵심 기술 스택</div>
                            <div className="tech-stack">
                                <div className="stack-group">
                                    <span className="stack-label">백엔드</span>
                                    <span className="tech-tag">Java</span>
                                    <span className="tech-tag">Spring</span>
                                    <span className="tech-tag">PHP</span>
                                </div>
                                <div className="stack-group">
                                    <span className="stack-label">프론트엔드</span>
                                    <span className="tech-tag">Vue</span>
                                    <span className="tech-tag">JavaScript</span>
                                </div>
                                <div className="stack-group">
                                    <span className="stack-label">인프라/운영</span>
                                    <span className="tech-tag">AWS S3</span>
                                </div>
                            </div>
                        </div>

                        <div className="project-card" id="project-pg-batch">
                            <div className="project-header">
                                <h3 className="project-title">자동결제(PG사 연동) 배치 개발</h3>
                                <span className="project-date">2022.09 - 2022.10</span>
                            </div>
                            <div className="project-section-title">시스템 구성도</div>
                            <img className="project-image" src="/autobilling.png" alt="자동결제 배치 시스템 구성도"
                                 loading="lazy"/>
                            <div className="project-section-title">프로젝트 동기</div>
                            <div className="project-description project-slot">
                                <div className="project-description">
                                    잔액이 임계값 이하로 내려갈 때 등록 카드로 자동 결제해 사용자 개입을 줄이고 결제 실패/지연에 따른 운영 리스크를 낮추기 위해 진행.
                                </div>
                            </div>
                            <div className="project-section-title">성과 및 임팩트</div>
                            <div className="project-description">
                                <div className="achievement">전체 매출의 약 10%가 자동결제 경로로 전환</div>
                                <div className="achievement">결제 실패/재시도 자동화로 운영 대응 시간 감소</div>
                            </div>
                            <div className="project-section-title">트러블슈팅 및 해결 경험</div>
                            <div className="project-description project-slot">
                                <div className="project-description">
                                    KCP API 타임아웃/응답 코드 케이스별 재시도 트랜잭션 설계, 일괄 처리의 원자성 보장을 위해 단계별 커밋 및 실패 알림(슬랙) 도입.
                                </div>
                            </div>
                            <div className="project-section-title">핵심 기술 스택</div>
                            <div className="tech-stack">
                                <div className="stack-group">
                                    <span className="stack-label">백엔드</span>
                                    <span className="tech-tag">Java</span>
                                    <span className="tech-tag">Spring</span>
                                </div>
                                <div className="stack-group">
                                    <span className="stack-label">데이터/처리</span>
                                    <span className="tech-tag">Batch</span>
                                </div>
                                <div className="stack-group">
                                    <span className="stack-label">데이터베이스</span>
                                    <span className="tech-tag">MySQL</span>
                                </div>
                            </div>
                        </div>

                        <div className="project-card" id="project-dynamic-template">
                            <div className="project-header">
                                <h3 className="project-title">다이나믹 템플릿 추가 컴포넌트 개선</h3>
                            </div>
                            <div className="project-section-title">시스템 구성도</div>
                            <div className="project-container">
                                <figure className="project-figure">
                                    <span className="image-badge">Before</span>
                                    <img className="project-image" src="/component.png" alt="다이나믹 템플릿 개선 전"/>
                                    <figcaption className="image-caption">개선 전 (Before)</figcaption>
                                </figure>
                                <figure className="project-figure">
                                    <span className="image-badge success">After</span>
                                    <img alt="정산 페이지 시스템 다이어그램 (개선 후)" className="project-image"
                                         src="/component2.png"/>
                                    <figcaption className="image-caption">개선 후 (After)</figcaption>
                                </figure>
                            </div>
                            <div className="project-section-title">프로젝트 동기</div>
                            <div className="project-description project-slot">
                                <div className="project-description">
                                    템플릿별로 누적된 복잡한 조건문과 결합된 로직 때문에 신규 다이나믹 템플릿을 추가하려면 많은 시간이 소요되고.
                                    이를 해결하기 위해 각 기능을 재조립 가능한 컴포넌트 단위로 분리했습니다
                                </div>
                            </div>
                            <div className="project-section-title">주요 변경점</div>
                            <div className="project-description">
                                <ul className="about-check-list">
                                    <li>기존 옵션 -> 템플릿 종류를 템플릿 -> 옵션으로 구조 변경</li>
                                    <li>기존 템플릿별 조건 분기 코드를 항목 단위로 분리</li>
                                    <li>템플릿을 컴포넌트 조합으로 구성하도록 구조 개편</li>
                                </ul>
                            </div>
                            <div className="project-section-title">성과 및 임팩트</div>
                            <div className="project-description">
                                <div className="achievement">신규 템플릿 추가 작업시간을 컴포넌트 조립만 하면 완료되게 변경하여 신속 처리</div>
                                <div className="achievement">코드 가독성과 유지보수성 향상</div>
                            </div>
                            <div className="project-section-title">핵심 기술 스택</div>
                            <div className="tech-stack">
                                <div className="stack-group">
                                    <span className="stack-label">프론트엔드</span>
                                    <span className="tech-tag">Vue</span>
                                </div>
                            </div>
                        </div>

                    </div>
                </section>

            </main>
            <footer className="footer">
                <small>감사합니다.</small>
            </footer>
        </div>
    );
}
export default Documents