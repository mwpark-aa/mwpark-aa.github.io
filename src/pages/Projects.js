import React, {useState} from "react";
import ProjectTimeline from "../components/ProjectTimeline";
import Skills from "../components/Skills";
import {Box, Grid, useTheme} from "@mui/material";
import styles from "./no-scroll.css";


const Projects = () => {
    const theme = useTheme();
    const [highlightedSkill, setHighlightedSkill] = useState(null);
    const [highlightedColor, setHighlightedColor] = useState(null);

    const handleSkillClick = (skill, color) => {
        setHighlightedSkill(skill);
        setHighlightedColor(color);
    };

    return (
        <Grid className={styles}
              container
              spacing={2}
              sx={{
                  height: {lg: "100vh"},
                  overflow: {lg: "hidden"}
              }}
        >
          <Grid item lg={5} sm={12}>
            <Box
              sx={{
                position: "sticky",
                top: 0,
                height: {lg: "calc(100vh - 80px)"}, // Subtract padding
                overflowY: {lg: "auto"},
                padding: 2,
                [theme.breakpoints.down('lg')]: {
                  height: 'auto',
                  overflowY: 'visible',
                },
              }}
            >
              <Skills onClick={handleSkillClick}/>
            </Box>
          </Grid>

            <Grid item lg={7} sm={12}>
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
