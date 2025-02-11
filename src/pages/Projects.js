import React, {useState} from "react";
import ProjectTimeline from "../components/ProjectTimeline";
import Skills from "../components/Skills";
import {Box, Grid, useTheme} from "@mui/material";


const Projects = () => {
    const theme = useTheme();
    const [highlightedSkill, setHighlightedSkill] = useState(null);
    const [highlightedColor, setHighlightedColor] = useState(null);

    const handleSkillClick = (skill, color) => {
        setHighlightedSkill(skill);
        setHighlightedColor(color);
    };

    return (
        <Grid
            container
            spacing={2}
            sx={{
                height: {lg: "100vh"},
                overflow: {lg: "hidden"}
            }}
        >
            <Grid item lg={4} sm={12}>
                <Box
                    sx={{
                        position: "sticky",
                        top: 0,
                        overflowY: "hidden",
                        padding: 2,
                    }}
                >
                    <Skills onClick={handleSkillClick}/>
                </Box>
            </Grid>

            <Grid item lg={8} sm={12}>
                <Box
                    sx={{
                        height: {lg: "calc(100vh - 80px)"},
                        overflowY: {lg: "auto"},
                        padding: 2,
                        [theme.breakpoints.down('lg')]: {
                            height: 'auto',
                            overflowY: 'visible',
                        },
                    }}
                >
                    <ProjectTimeline
                        highlightedSkill={highlightedSkill}
                        highlightedColor={highlightedColor}
                    />
                </Box>
            </Grid>
        </Grid>
    );
};

export default Projects;
