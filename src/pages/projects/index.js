import React, {useState} from "react";
import ProjectTimeline from "../../components/ProjectTimeline";
import Skills from "../../components/Skills";
import {Grid} from "@mui/material";
import styles from "../no-scroll.css";
import {ProjectBox} from "../../constants/style";

const Projects = () => {
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
        <Grid
            className={styles}
            container
            spacing={2}
            sx={{
                height: {lg: "100vh"},
                overflow: {lg: "hidden"}
            }}
        >
            <Grid item lg={5} sm={12}>
                <ProjectBox>
                    <Skills onClick={handleSkillClick}/>
                </ProjectBox>
            </Grid>

            <Grid item lg={7} sm={12}>
                <ProjectBox>
                    <ProjectTimeline selectedSkills={selectedSkills}/>
                </ProjectBox>
            </Grid>
        </Grid>
    );
};

export default Projects;
