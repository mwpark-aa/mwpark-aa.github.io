import React, {useState} from "react";
import ProjectTimeline from "../../components/ProjectTimeline";
import Skills from "../../components/Skills";
import {Container, Grid} from "@mui/material";
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
        <Container
            sx={{
                overflow: "hidden",
                padding: 0,
            }}
            maxWidth={false}
        >
            <Grid container spacing={1} sx={{height: "100vh - 80"}}>
                <Grid item lg={4} sm={12}>
                    <ProjectBox
                        sx={{
                            height: "100vh - 80",
                            overflowY: "auto",
                        }}
                    >
                        <Skills onClick={handleSkillClick}/>
                    </ProjectBox>
                </Grid>
                <Grid item lg={8} sm={12}>
                    <ProjectBox
                        sx={{
                            height: "100vh - 80",
                            overflowY: "auto",
                        }}
                    >
                        <ProjectTimeline selectedSkills={selectedSkills}/>
                    </ProjectBox>
                </Grid>
            </Grid>
        </Container>
    );
};

export default Projects;
