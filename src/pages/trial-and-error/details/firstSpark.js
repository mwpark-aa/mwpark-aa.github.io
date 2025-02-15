import React from "react";
import {Container, Typography, List, ListItem, Divider, ListItemText, Box} from "@mui/material";
import FloatingNavigation from "../../../components/FloatingNavigation";
import ExpandableBox from "../../../components/ExpandItem";
import CodeBlock from "../../../components/CodeBlock";
import {
    DATAFRAME_CREATION_CODE,
    DATAFRAME_GROUPING_AGGREGATION_CODE,
    DATAFRAME_SIMPLE_OPERATIONS_CODE,
    DATAFRAME_SQL_USAGE_CODE,
    RDD_CREATION_CODE,
    RDD_SIMPLE_OPERATION_CODE,
    SPARK_SESSION_CREATION_CODE
} from "./sparkConstants";
import {BackgroundText} from "../../../constants/style";


const FirstSpark = () => {
    const navButtons = [
        {label: "사용한 이유?", target: "why-use-spark"},
        {label: "Spark 란?", target: "what-is-spark"},
        {label: "어려웠던 점", target: "challenges"},
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

            <Typography variant="h5">
                Apache Spark를 처음 사용해보면서, 분산 데이터 처리의 강력함을 직접 경험했다. 아직 Spark 에 대해서 잘 알지는 못하지만
                사용하면서 공부한 기본 개념과 첫 사용 후기를 기록하려고 한다.
            </Typography>
            <br/>
            <Typography variant="h4" gutterBottom id="why-use-spark" pb={3} pt={10}>
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
            <Typography variant="h4" gutterBottom id="what-is-spark" pb={3} pt={10}>
                🤷 Spark란?
            </Typography>
            <Typography variant="h6">
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

            <Typography variant="h6" pb={1} pt={1}>
                🔑 주요 개념
            </Typography>
            <List>
                <ListItem>
                    <ListItemText primary=" ✅ 선언 방법"/>
                </ListItem>
                <Box sx={{pl: {lg: 5}}}>
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

            <Typography variant="h4" gutterBottom pb={3} pt={10} id={'challenges'}>
                😨 어려웠던 점
            </Typography>

            <List>
                <ListItem>
                    <ListItemText primary="✅ 실제 환경과 로컬의 차이가 컸다" sx={{fontWeight: "bold"}}/>
                </ListItem>
                <List sx={{pl: {lg: 4}}}>
                    <ExpandableBox component={ListItem} title="📌 예시 파일은 용량이 20MB 정도인 대략 100만 라인의 파일이었다.">
                        <BackgroundText variant="body2">
                            <Box>
                                Spark 의 장점은 대용량 데이터에서 특히 더 드러난다. 작은 크기의 데이터일 경우,
                                Spark 를 이용해 Schema 설정 → Dataframe 생성 → RDD 변환 및 Partition 계산 과정을 거치기보다,
                                단순 반복문을 이용하는 것이 더 빠를 수 있다.
                            </Box>
                            <Box mt={1}>
                                20MB 데이터를 처리하는데 Python 코드로는 10초 내외로 끝나는 반면,
                                Spark 를 사용하면 20초 내외가 걸려 혼란스러움이 있었다.
                            </Box>
                        </BackgroundText>
                    </ExpandableBox>
                    <ExpandableBox component={ListItem} title="📌 로컬에서 성능 테스트하기가 어렵다.">
                        <BackgroundText variant="body2">
                            <Box>
                                Spark 는 분산 환경에서 성능이 극대화된다. 로컬 환경에서는 CPU 개수의 한계로 인해
                                성능 문제가 코드 로직 때문인지, 환경 때문인지 구별하기가 어려웠다.
                            </Box>
                            <Box mt={1}>
                                예를 들어, 로컬에서는 실행 시간이 3시간이 넘는 작업이
                                실서버와 비슷하게 만든 Jupyter Notebook 으로 코드를 비슷하게 옮기자 20분 만에 완료되는 경우가 있었다.
                                하지만 실서버 배포 후 배치 실행 시 Timeout 문제가 발생했다.
                            </Box>
                            <Box mt={1}>
                                원인은 로직 문제였다. 실서버에서만 가져올 수 있는 데이터를 처리할 때
                                1억 row 를 O(n²) 복잡도로 처리하면서 성능 이슈가 발생했다.
                                이를 찾느라 Spark 자원 조정 등 엉뚱한 시도를 하며 시간을 낭비했다.
                            </Box>
                            <Box mt={1}>
                                만약 로컬에서 분산 환경을 비슷하게 재현할 수 있었다면, 시간 낭비, 버그없이 처리 가능했었을것 같다
                            </Box>
                        </BackgroundText>
                    </ExpandableBox>
                </List>

                <ListItem>
                    <ListItemText primary="✅ 단순 이관작업이 아닌 구조 변경과 성능 개선이 목적인 작업이었다" sx={{fontWeight: "bold"}}/>
                </ListItem>
                <List sx={{pl: {lg: 4}}}>
                    <ExpandableBox component={ListItem} title="📌 분산 환경에서는 정렬이 불가능하다">
                        <BackgroundText variant="body2">
                            <Box>
                                배치 실행 시간이 1~2시간 걸리다 보니, 진행도를 확인하기 위해
                                인덱스를 추가하려 했지만 예상치 못한 문제가 발생했다.
                            </Box>
                            <Box mt={1}>
                                데이터를 Partitioning 하면 순서가 보장되지 않는다. 정렬은 분산 처리 후 집계된 후에 가능하다.
                                연산 전에 정렬할 수도 있지만, 이 경우 분산 처리가 불가능해진다.
                            </Box>
                            <Box mt={1}>
                                해결책으로 2000만 라인 단위로 나누어 청크별 진행도를 확인하는 방식으로 변경했다.
                            </Box>
                        </BackgroundText>
                    </ExpandableBox>
                    <ExpandableBox component={ListItem} title="📌 파일의 우선순위">
                        <BackgroundText variant="body2">
                            <Box>
                                기존 방식에서는 파일의 `LastModified` 를 확인해 변경되면 재작업을 수행했다.
                                하지만 이 방식으로 인해 새로 등록된 파일들이 변경된 기존 파일 때문에 무기한 대기 상태가 되었다.
                            </Box>
                            <Box mt={1}>
                                이로 인해 <strong> 등록한 파일 언제 처리되나요? </strong> 라는 문의가 많아졌고,
                                해결책으로 기존 파일과 신규 파일의 배치를 분리하여 처리하도록 변경했다.
                            </Box>
                        </BackgroundText>
                    </ExpandableBox>
                </List>
            </List>
        </Container>
    );
};

export default FirstSpark;
