import React, {useState} from "react";
import ProjectTimeline from "../components/ProjectTimeline";
import Skills from "../components/Skills";
import {Box, Grid, useTheme} from "@mui/material";
import styles from "./no-scroll.css";

const Projects = () => {
  const theme = useTheme();
  const [selectedSkills, setSelectedSkills] = useState([]);

  const handleSkillClick = (skill) => {
    setSelectedSkills(prevSelectedSkills => {
      if (prevSelectedSkills.includes(skill)) {
        return prevSelectedSkills.filter(s => s !== skill);
      } else {
        return [...prevSelectedSkills, skill];
      }
    });
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
            height: {lg: "calc(100vh - 80px)"},
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
            selectedSkills={selectedSkills}
          />
        </Box>
      </Grid>
    </Grid>
  );
};

export default Projects;
