import React, {useState} from "react";
import {Container, Typography, List, ListItem, Divider, ListItemText, Box} from "@mui/material";
import FloatingNavigation from "../../../components/FloatingNavigation";
import ExpandableBox from "../../../components/ExpandItem";
import CodeBlock from "../../../components/CodeBlock";
import {
    DATAFRAME_CREATION_CODE,
    DATAFRAME_GROUPING_AGGREGATION_CODE,
    DATAFRAME_SIMPLE_OPERATIONS_CODE,
    DATAFRAME_SQL_USAGE_CODE, RDD_CREATION_CODE, RDD_SIMPLE_OPERATION_CODE, SPARK_SESSION_CREATION_CODE
} from "./sparkConstants";


const FirstSpark = () => {
    const navButtons = [
        {label: "사용한 이유?", target: "why-use-spark"},
        {label: "Spark 란?", target: "what-is-spark"},
        {label: "어려웠던점", target: "challenges"},
    ];

    return (
        <Container maxWidth="md" sx={{py: 8}}>
            <FloatingNavigation buttons={navButtons}/>
            <Typography variant="h3" gutterBottom>
                Spark 첫 사용기
            </Typography>

            <Typography variant="subtitle1" color="text.secondary" gutterBottom>
                202x년 x월 xx일
            </Typography>

            <Divider sx={{my: 2}}/>

            <Typography variant="h5" paragraph>
                Apache Spark를 처음 사용해보면서, 분산 데이터 처리의 강력함을 직접 경험했다. 아직 Spark 에 대해서 잘 알지는 못하지만
                사용하면서 공부한 기본 개념과 첫 사용 후기를 기록하려고 한다.
            </Typography>
            <br/>
            <Typography variant="h5" gutterBottom id="why-use-spark" pb={3} pt={10}>
                🚀 Spark 를 사용하게 된 배경
            </Typography>
            <Typography variant="body1">
                기존 1시간마다 파일당 1억 row 정도의 데이터를 처리하는 배치가 있었는데, 실행시간이 7~8시간, 때로는 20시간까지 넘어가 주기가 긴 배치였다.
                자세하게 기술할수는 없지만 대략적인 구조를 설명하자면
                <List>
                    <ListItem>✅ 파일을 불러와서 서버에 임시로 저장</ListItem>
                    <ListItem>✅ 파일을 일정 라인 단위로 분할</ListItem>
                    <ListItem>✅ 분할된 파일을 병렬로 처리</ListItem>
                </List>
                이런 구조로 되어있었다. 다만 여기서 문제가
                <List>
                    <ListItem>✅ 서버에서 Supervisor 로 진행하고 있어서 모니터링이 어렵다는 점.</ListItem>
                    <ListItem>✅ 기존 파일들도 처리하기 때문에 신규 등록된 파일의 우선순위가 떨어진다는 점.</ListItem>
                    <ListItem>✅ 스크립트가 산개되어 있어서 관리 포인트가 많아진다는 점 (파이프라인이 복잡함)</ListItem>
                </List>
                때문에 이관을 결심하게 되었다. Spark 사용을 제안받아서 Spark 사용을 검토했다. 나에게 Spark 는 너무 생소했고, 때문에 기초부터 조금식 리서치를 했다.
            </Typography>
            <Typography variant="h5" gutterBottom id="what-is-spark" pb={3} pt={10}>
                🚀 Spark란?
            </Typography>
            <Typography variant="h6" paragraph>
                Spark란 <strong>클러스터 환경에서 사용하기에 적합한 인메모리 방식의 병렬처리 시스템</strong> 이다.
                <Box px={2} py={2}>
                    <Typography sx={{fontSize: 'small'}}>
                        <span style={{color: 'red'}}>*</span> 클러스터 (Cluster) 환경 : 여러 대의 컴퓨터를 묶어서 하나처럼 사용하는 환경 (예:
                        Kubernetes, Hadoop YARN, Mesos 등)
                    </Typography>
                    <Typography sx={{fontSize: 'small'}}>
                        <span style={{color: 'red'}}>*</span> 인메모리 (In-Memory) 방식 : 디스크가 아닌 메모리에서 작업 (캐싱, 높은 대역폭을 활용하여
                        빠른 연산 수행)
                    </Typography>
                </Box>
            </Typography>

            {/* 주요 개념 목록 */}
            <Typography variant="h6" pb={1} pt={1}>
                🔑 주요 개념
            </Typography>
            <List>
                <ListItem>
                    <ListItemText primary=" ✅ 선언 방법"/>
                </ListItem>
                <Box pl={5}>
                    <CodeBlock language="python">
                        {SPARK_SESSION_CREATION_CODE}
                    </CodeBlock>
                </Box>
                <ListItem>
                    <ListItemText primary=" ✅ RDD (Resilient Distributed Dataset)"/>
                </ListItem>
                <List sx={{pl: {lg: 4}}}>
                    <ListItem>
                        <ListItemText primary="📌 Spark의 기본적인 데이터 추상화 개념"/>
                    </ListItem>
                    <ListItem>
                        <ListItemText primary="📌 불변성, 분산, 탄력성을 가진 데이터 컬렉션"/>
                    </ListItem>
                    <ListItem>
                        <ListItemText primary="📌 클러스터의 여러 노드에 분산되어 병렬 처리 가능"/>
                    </ListItem>
                    <ExpandableBox component={ListItem} title={"🔎 사용 예시"}>
                        <Box>
                            <ExpandableBox component={ListItem} title={"✔️ 만들기"}>
                                <CodeBlock language={'python'}>
                                    {RDD_CREATION_CODE}
                                </CodeBlock>
                            </ExpandableBox>
                            <ExpandableBox component={ListItem} title={"✔️ 간단 연산"}>
                                <CodeBlock language={'python'}>
                                    {RDD_SIMPLE_OPERATION_CODE}
                                </CodeBlock>
                            </ExpandableBox>
                        </Box>
                    </ExpandableBox>
                </List>

                <ListItem>
                    <ListItemText primary="✅ DataFrame 과 Dataset"/>
                </ListItem>
                <List sx={{pl: {lg: 4}}}>
                    <ListItem>
                        <ListItemText primary="📌 열(row)에 이름이 있는 데이터 컬렉션"/>
                    </ListItem>
                    <ListItem>
                        <ListItemText primary="📌 명시적인 스키마를 가지고 있어 데이터의 구조를 이해하기 쉬움"/>
                    </ListItem>
                    <ExpandableBox component={ListItem} title={"🔎 사용 예시"}>
                        <Box>
                            <ExpandableBox component={ListItem} title={"✔️ 만들기"}>
                                <CodeBlock language={'python'}>
                                    {DATAFRAME_CREATION_CODE}
                                </CodeBlock>
                            </ExpandableBox>
                            <ExpandableBox component={ListItem} title={"✔️ 간단 연산"}>
                                <CodeBlock language={'python'}>
                                    {DATAFRAME_SIMPLE_OPERATIONS_CODE}
                                </CodeBlock>
                            </ExpandableBox>
                            <ExpandableBox component={ListItem} title={"✔️ 그룹화 집계"}>
                                <CodeBlock language={'python'}>
                                    {DATAFRAME_GROUPING_AGGREGATION_CODE}
                                </CodeBlock>
                            </ExpandableBox>
                            <ExpandableBox component={ListItem} title={"✔️ SQL 사용"}>
                                <CodeBlock language={'python'}>
                                    {DATAFRAME_SQL_USAGE_CODE}
                                </CodeBlock>
                            </ExpandableBox>
                        </Box>
                    </ExpandableBox>
                </List>
            </List>

            {/* 사용 후기 */}
            <Typography variant="h5" gutterBottom sx={{mt: 4}}>
                ✨ 첫 사용 후기
            </Typography>
            <Typography variant="body1" paragraph>
                첫 번째 Spark 애플리케이션을 실행하면서, 분산 환경에서의 데이터 처리가 얼마나 강력한지 깨달았다.
                하지만 설정이 까다로워 처음에는 시행착오가 있었다.
            </Typography>

        </Container>
    );
};

export default FirstSpark;
