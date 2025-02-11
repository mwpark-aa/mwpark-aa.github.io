import React from "react";
import {Box, Chip, Container, Typography} from "@mui/material";
import {
    Timeline,
    TimelineConnector,
    TimelineContent,
    TimelineDot,
    TimelineItem,
    timelineItemClasses,
    TimelineSeparator
} from "@mui/lab";

const projects = [
    {
        year: "2023",
        month: "January",
        title: "Project A",
        descriptions: ["Developed a full-stack web application using React and Node.js."],
        skills: ['Python', 'Django'],
    },
    {
        year: "2023",
        month: "March",
        title: "Project B",
        descriptions: ["Developed a full-stack web application using React and Node.js."],
        skills: ['Python', 'Django'],
    },
    {
        year: "2022",
        month: "10월",
        title: "Project C",
        descriptions: ["Developed a full-stack web application using React and Node.js."],
        skills: ['Python', 'Django', "Vue"],
    },
    {
        year: "2022",
        month: "9 월",
        title: "자동결제 배치",
        descriptions: [
            "금액이 일정 이하로 내려갈 경우 등록해둔 카드에서 자동으로 금액이 결제되는 배치 개발",
            "전체 매출의 10% 정도를 자동결제를 통해 이루어짐"
        ],
        skills: ['Java', 'Spring', 'SCDF', 'Jenkins', 'Batch'],
    },
    {
        year: "2022",
        month: "7 월",
        title: ["와이더플래닛 인턴 입사"],
        descriptions: [],
        skills: [],
    },
    {
        year: "2021",
        month: "12 월",
        title: "메이사 인턴 입사",
        descriptions: ["회사 내부에서 사용할 BI 툴 개발"],
        skills: ['Python', 'Django'],
    },
];

const groupProjectsByYear = (projects) => {
    const grouped = {};
    projects.forEach(project => {
        if (!grouped[project.year]) {
            grouped[project.year] = [];
        }
        grouped[project.year].push(project);
    });
    return Object.entries(grouped).sort((a, b) => b[0] - a[0]);
};

const ProjectTimeline = ({highlightedSkill, highlightedColor, skills}) => {
    const groupedProjects = groupProjectsByYear(projects);
    const allSkills = Object.values(skills).flat();

    return (
        <Container>
            <Timeline sx={{
                [`& .${timelineItemClasses.root}:before`]: {
                    flex: 0,
                    padding: 0,
                },
            }}
            >
                {groupedProjects.map(([year, yearProjects]) => (
                    <React.Fragment key={year}>
                        <TimelineItem>
                            <TimelineSeparator>
                                <TimelineDot color="primary" variant="outlined"/>
                                <TimelineConnector/>
                            </TimelineSeparator>
                            <TimelineContent>
                                <Typography variant="h5" component="span">
                                    {year}
                                </Typography>
                            </TimelineContent>
                        </TimelineItem>
                        {yearProjects.map((project, projectIndex) => (
                            <TimelineItem key={`${year}-${projectIndex}`}>
                                <TimelineSeparator>
                                    <TimelineDot color="secondary"/>
                                    {projectIndex < yearProjects.length - 1 && <TimelineConnector/>}
                                </TimelineSeparator>
                                <TimelineContent sx={{py: 4, px: 2}}>
                                    <Box>
                                        <Box sx={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            marginBottom: 2
                                        }}>
                                            <Typography variant="h6" sx={{marginRight: 2}}>{project.title}</Typography>
                                            <Typography variant="body2"
                                                        color="textSecondary">{project.month}</Typography>
                                        </Box>
                                        <Box sx={{marginLeft: 2}}>
                                            {project.descriptions?.map((description, index) => (
                                                <Typography
                                                    variant="body1"
                                                    key={index}
                                                    sx={{
                                                        marginBottom: 1,
                                                        display: 'flex',
                                                        alignItems: 'center'
                                                    }}
                                                >
                                                    <span style={{marginRight: '8px'}}>✅</span>
                                                    {description}
                                                </Typography>
                                            ))}
                                        </Box>
                                        <Box sx={{marginLeft: 2}}>
                                            {allSkills.map((skill, index) => (
                                                <Chip
                                                    key={index}
                                                    label={skill}
                                                    color={highlightedSkill === skill ? highlightedColor : "default"}
                                                    variant={highlightedSkill === skill ? "filled" : "outlined"}
                                                    size="small"
                                                    sx={{
                                                        margin: 0.1,
                                                        display: project.skills.includes(skill) ? 'inline-flex' : 'none',
                                                    }}
                                                />
                                            ))}
                                        </Box>
                                    </Box>
                                </TimelineContent>
                            </TimelineItem>
                        ))}
                    </React.Fragment>
                ))}
            </Timeline>
        </Container>
    );
};

export default ProjectTimeline;
