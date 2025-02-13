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
import {categoryColors, projects, skills} from "../constants";


const ProjectTimeline = ({selectedSkills}) => {
    const allSkills = Object.values(skills).flat();
    const getSkillCategory = (skill) => {
        for (const [category, skillList] of Object.entries(skills)) {
            if (skillList.includes(skill)) {
                return category.charAt(0).toUpperCase() + category.slice(1);
            }
        }
    };

    return (
        <Container>
            <Timeline
                sx={{
                    [`& .${timelineItemClasses.root}:before`]: {
                        flex: 0,
                        padding: 0,
                    },
                }}
            >
                <TimelineItem>
                    <TimelineSeparator>
                        <TimelineDot
                            color="primary"
                            variant='outlined'
                        />
                        <TimelineConnector/>
                    </TimelineSeparator>
                    <TimelineContent sx={{px: 3}}>
                        <Typography variant="h6">
                            현재
                        </Typography>
                    </TimelineContent>
                </TimelineItem>
                {projects.map((project, index) => (
                    <TimelineItem key={index}>
                        <TimelineSeparator>
                            <TimelineDot
                                color={project.skills.length ? "secondary" : "primary"}
                                variant={project.skills.length ? "filled" : "outlined"}
                            />
                            {index < projects.length - 1 && <TimelineConnector/>}
                        </TimelineSeparator>
                        <TimelineContent sx={{py: 3, px: 3}}>
                            <Box>
                                <Box sx={{display: 'flex', alignItems: 'center', marginBottom: 1}}>
                                    <Typography variant="h6" sx={{marginRight: 2}}>{project.title}</Typography>
                                    <Typography variant="body2" color="textSecondary">
                                        {project.year}년 {project.month}
                                    </Typography>
                                </Box>
                                <Box sx={{marginLeft: 2}}>
                                    {project.descriptions?.map((description, idx) => (
                                        <Typography
                                            variant="body2"
                                            key={idx}
                                            sx={{
                                                marginBottom: 0.5,
                                                display: 'flex',
                                                alignItems: 'center'
                                            }}
                                        >
                                            <span style={{marginRight: '8px'}}>✅</span>
                                            {description}
                                        </Typography>
                                    ))}
                                    {project.improves?.map((improve, idx) => (
                                        <Typography
                                            variant="body2"
                                            key={idx}
                                            sx={{
                                                marginBottom: 0.5,
                                                display: 'flex',
                                                alignItems: 'center'
                                            }}
                                        >
                                            <span style={{marginRight: '8px'}}>💡</span>
                                            {improve}
                                        </Typography>
                                    ))}
                                </Box>
                                <Box sx={{marginLeft: 2, marginTop: 1}}>
                                    {allSkills.map((skill, idx) => (
                                      <Chip
                                        key={idx}
                                        label={skill}
                                        color={categoryColors[getSkillCategory(skill)]}
                                        variant={selectedSkills.includes(skill) ? "filled" : "outlined"}
                                        size="small"
                                        sx={{
                                            margin: 0.5,
                                            display: project.skills.includes(skill) ? 'inline-flex' : 'none',
                                        }}
                                      />
                                    ))}
                                </Box>
                            </Box>
                        </TimelineContent>
                    </TimelineItem>
                ))}
            </Timeline>
        </Container>
    );
};

export default ProjectTimeline;
