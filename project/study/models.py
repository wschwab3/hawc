import json
import logging
import os
import collections
import itertools

from django.db import models, transaction
from django.apps import apps
from django.core.exceptions import (ValidationError, ObjectDoesNotExist,
                                    MultipleObjectsReturned)
from django.core.urlresolvers import reverse
from django.http import Http404

from reversion import revisions as reversion

from assessment.models import Assessment
from assessment.serializers import AssessmentSerializer
from lit.models import Reference
from utils.helper import HAWCDjangoJSONEncoder, SerializerHelper, cleanHTML
from utils.models import get_crumbs

from . import managers


class Study(Reference):
    objects = managers.StudyManager()

    COI_REPORTED_CHOICES = (
        (0, 'Authors report they have no COI'),
        (1, 'Authors disclosed COI'),
        (2, 'Unknown'),
        (3, 'Not reported'))

    TEXT_CLEANUP_FIELDS = (
        'coi_details',
        'funding_source',
    )

    STUDY_TYPE_FIELDS = {
        'bioassay',
        'epi',
        'epi_meta',
        'in_vitro',
    }

    bioassay = models.BooleanField(
        verbose_name='Animal bioassay',
        default=False,
        help_text='Study contains animal bioassay data')
    epi = models.BooleanField(
        verbose_name='Epidemiology',
        default=False,
        help_text='Study contains epidemiology data')
    epi_meta = models.BooleanField(
        verbose_name='Epidemiology meta-analysis',
        default=False,
        help_text='Study contains epidemiology meta-analysis/pooled analysis data')
    in_vitro = models.BooleanField(
        default=False,
        help_text='Study contains in-vitro data')
    short_citation = models.CharField(
        max_length=256,
        help_text="How the study should be identified (i.e. Smith et al. (2012), etc.)")
    full_citation = models.TextField(
        help_text="Complete study citation, in desired format.")
    coi_reported = models.PositiveSmallIntegerField(
        choices=COI_REPORTED_CHOICES,
        default=0,
        verbose_name="COI reported",
        help_text='Was a conflict of interest reported by the study authors?')
    coi_details = models.TextField(
        blank=True,
        verbose_name="COI details",
        help_text="Details related to potential or disclosed conflict(s) of interest")
    funding_source = models.TextField(blank=True)
    study_identifier = models.CharField(
        max_length=128,
        blank=True,
        verbose_name="Internal study identifier",
        help_text="Reference descriptor for assessment-tracking purposes "
                  "(for example, \"{Author, year, #EndNoteNumber}\")")
    contact_author = models.BooleanField(
        default=False,
        help_text="Was the author contacted for clarification of methods or results?")
    ask_author = models.TextField(
        blank=True,
        verbose_name="Correspondence details",
        help_text="Details on correspondence between data-extractor and author, if needed.")
    published = models.BooleanField(
        default=False,
        help_text="If True, this study, risk of bias, and extraction details "
                  "may be visible to reviewers and/or the general public "
                  "(if assessment-permissions allow this level of visibility). "
                  "Team-members and project-management can view both "
                  "published and unpublished studies.")
    summary = models.TextField(
        blank=True,
        verbose_name="Summary and/or extraction comments",
        help_text="Study summary or details on data-extraction needs.")

    COPY_NAME = "studies"

    class Meta:
        verbose_name_plural = "Studies"
        ordering = ("short_citation", )

    @classmethod
    def save_new_from_reference(cls, reference, attrs):
        """
        Save a new Study object from an existing reference object and the
        required information; difficult because of OneToOne relationship.

        Reference:
        https://github.com/lsaffre/lino/blob/master/lino/utils/mti.py
        """
        parent_link_field = Study._meta.parents.get(reference.__class__, None)
        attrs[parent_link_field.name] = reference
        for field in reference._meta.fields:
            attrs[field.name] = getattr(reference, field.name)
        return Study.objects.create(**attrs)

    @classmethod
    @transaction.atomic
    def copy_across_assessment(cls, studies, assessment):
        # copy selected studies from one assessment to another.
        cw = collections.defaultdict(dict)

        # assert all studies come from a single assessment
        source_assessment = Assessment.objects\
            .filter(references__in=studies)\
            .distinct()\
            .values_list('id', flat=True)
        if len(source_assessment) != 1:
            raise ValueError('Studies must come from the same assessment')
        source_assessment = source_assessment[0]
        cw[Assessment.COPY_NAME][source_assessment] = assessment.id

        # copy studies; flag if any epi-meta studies exist
        any_epi_meta = False
        for study in studies:
            logging.info('Copying study {} to assessment {}'
                         .format(study.id, assessment.id))

            # get child-types and copy
            children = []

            if study.bioassay:
                children.extend(list(study.experiments.all()))

            if study.epi:
                children.extend(list(study.study_populations.all()))

            if study.in_vitro:
                children.extend(itertools.chain(
                    study.ivchemicals.all(),
                    study.ivcelltypes.all(),
                    study.ivexperiments.all()))

            if study.epi_meta:
                any_epi_meta = True
                children.extend(list(study.meta_protocols.all()))

            # copy study and references
            study._copy_across_assessment(cw)

            for child in children:
                child.copy_across_assessments(cw)

        # Copy epimeta.SingleResult after copying studies because to ensure
        # Study clones have already been created.
        if any_epi_meta:
            logging.info('Copying epi results')
            SingleResult = apps.get_model('epimeta', 'SingleResult')
            results = SingleResult.objects\
                .filter(meta_result__protocol__study__in=studies)
            for result in results:
                result.copy_across_assessments(cw)

        return cw

    def _copy_across_assessment(self, cw):
        # copy reference and identifiers
        # (except RIS which is assessment-specific)
        ref = self.reference_ptr
        idents = ref.identifiers.filter(database__in=[0, 1, 2])\
                    .values_list('id', flat=True)
        ref.id = None
        ref.assessment_id = cw[Assessment.COPY_NAME][self.assessment_id]
        ref.save()
        ref.identifiers.add(*idents)

        # copy study
        old_id = self.id
        self.id = None
        self.reference_ptr = ref
        self.assessment_id = cw[Assessment.COPY_NAME][self.assessment_id]
        self.save()

        # save self to crosswalk
        cw[self.COPY_NAME][old_id] = self.id

    def clean(self):
        pk_exclusion = {}
        if self.pk:
            pk_exclusion['pk'] = self.pk
        if Study.objects.filter(
                assessment=self.assessment,
                short_citation=self.short_citation
            ).exclude(**pk_exclusion).count() > 0:
            raise ValidationError('Error- short-citation name must be unique for assessment.')

    def __str__(self):
        return self.short_citation

    def get_absolute_url(self):
        return reverse('study:detail', args=[str(self.pk)])

    def get_update_url(self):
        return reverse('study:update', args=[str(self.pk)])

    def get_final_rob_url(self):
        final = self.get_final_rob()
        try:
            return final.get_final_url()
        except AttributeError:
            raise Http404('Final RoB does not exist')

    def get_assessment(self):
        return self.assessment

    def get_json(self, json_encode=True):
        return SerializerHelper.get_serialized(self, json=json_encode)

    def get_attachments_json(self):
        d = []
        for attachment in self.attachments.all():
            d.append(attachment.get_dict())
        return json.dumps(d, cls=HAWCDjangoJSONEncoder)

    def get_bioassay_endpoints(self):
        """
        Return a queryset of related bioassay endpoints for selected study
        """
        Endpoint = apps.get_model('animal', 'Endpoint')
        Experiment = apps.get_model('animal', 'Experiment')
        AnimalGroup = apps.get_model('animal', 'AnimalGroup')

        if not self.bioassay:
            return Endpoint.objects.none()

        return Endpoint.objects.filter(
                    animal_group__in=AnimalGroup.objects.filter(
                    experiment__in=Experiment.objects.filter(study=self)))

    def get_study_type(self):
        types = []
        for field in self.STUDY_TYPE_FIELDS:
            if getattr(self, field):
                types.append(field)
        return types

    @staticmethod
    def flat_complete_header_row():
        return (
            'study-id',
            'study-url',
            'study-short_citation',
            'study-full_citation',
            'study-coi_reported',
            'study-coi_details',
            'study-funding_source',
            'study-bioassay',
            'study-epi',
            'study-epi_meta',
            'study-in_vitro',
            'study-study_identifier',
            'study-contact_author',
            'study-ask_author',
            'study-summary',
            'study-published'
        )

    @staticmethod
    def flat_complete_data_row(ser):
        return (
            ser['id'],
            ser['url'],
            ser['short_citation'],
            ser['full_citation'],
            ser['coi_reported'],
            ser['coi_details'],
            ser['funding_source'],
            ser['bioassay'],
            ser['epi'],
            ser['epi_meta'],
            ser['in_vitro'],
            ser['study_identifier'],
            ser['contact_author'],
            ser['ask_author'],
            cleanHTML(ser['summary']),
            ser['published']
        )

    @staticmethod
    def get_docx_template_context(assessment, queryset):
        studies = [SerializerHelper.get_serialized(study, json=False) for study in queryset]
        return {
            "assessment": AssessmentSerializer().to_representation(assessment),
            "studies": studies
        }

    @classmethod
    def delete_caches(cls, ids):
        SerializerHelper.delete_caches(cls, ids)

    def get_crumbs(self):
        return get_crumbs(self, parent=self.assessment)

    def get_final_rob(self):
        try:
            return self.riskofbiases.get(final=True, active=True)
        except ObjectDoesNotExist:
            return None
        except MultipleObjectsReturned:
            raise ValidationError(
                'Multiple active final risk of bias reviews for "{}", '
                'there should only be one per study.'.format(self))

    def get_active_robs(self, with_final=True):
        if with_final:
            return self.riskofbiases\
               .filter(active=True)\
               .order_by('final', 'last_updated')\
               .prefetch_related('author')
        else:
            return self.riskofbiases\
               .filter(active=True, final=False)\
               .order_by('last_updated')\
               .prefetch_related('author')

    def optimized_for_serialization(self):
        return self.__class__.objects\
            .filter(id=self.id)\
            .prefetch_related(
                'identifiers',
                'searches',
                'riskofbiases__scores__metric__domain',
            ).first()


class Attachment(models.Model):
    objects = managers.AttachmentManager()
    
    study = models.ForeignKey(Study, related_name="attachments")
    attachment = models.FileField(upload_to="study-attachment")

    def __str__(self):
        return self.filename

    def get_absolute_url(self):
        return reverse('study:attachment_detail', args=[self.pk])

    def get_delete_url(self):
        return reverse('study:attachment_delete', args=[self.pk])

    def get_crumbs(self):
        return get_crumbs(self, parent=self.study)

    @property
    def filename(self):
        return os.path.basename(self.attachment.name)

    def get_dict(self):
        return {"url": self.get_absolute_url(),
                "filename": self.filename,
                "url_delete": self.get_delete_url()}

    def get_assessment(self):
        return self.study.assessment


reversion.register(Study)
